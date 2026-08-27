/**
 * The board island — the one hydrated component in doc-hub.
 *
 * doc-portal ships zero client-side JavaScript and argues the case in
 * src/components/catalog/SearchBar.astro: a search is a GET form because the
 * query belongs in the URL, and type-ahead waits until scanning stops working.
 * That argument does not reach here. A story map is edited by direct
 * manipulation — pick a card up, put it somewhere else — and there is no URL, no
 * form and no round trip that expresses "this story moved from R2 to MVP and
 * above the one below it". So this component hydrates, and the hydration stops
 * at its edge: every other page in doc-sm is still HTML with no script attached.
 *
 * ## Drag policy: one action per drag
 *
 * dnd-kit's canonical multi-container recipe mutates state during `onDragOver`
 * so a gap opens in the target list. This board deliberately does not. With undo
 * in the design, reshuffling on every pointer crossing would deposit a dozen
 * entries in the history for a single drag, and undo would stop meaning
 * anything. State is untouched until `onDragEnd`, which computes one index and
 * dispatches one action.
 *
 * The cost is a less rich preview: you get the overlay and a highlighted target
 * cell, not a gap opening ahead of the card. If that tests as unclear, add
 * `onDragOver` *and* mark those dispatches as history-merging — the trade is
 * written down here so the next person does not have to re-derive it.
 */

import {
	closestCenter,
	DndContext,
	DragOverlay,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
	type Announcements,
	type CollisionDetection,
	type DragEndEvent,
	type DragStartEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { clearFileInput, downloadText, filenameFor, readTextFile } from '../../lib/files.ts';
import * as storage from '../../lib/storage.ts';
import {
	activityPositionOf,
	deliveryPositionOf,
	stepPositionOf,
	storyPositionOf,
	toBoard,
} from '../../lib/board/convert.ts';
import { applyAction, isEdit } from '../../lib/board/apply.ts';
import { cardsWithDetail } from '../../lib/board/detail.ts';
import {
	canRedo,
	canUndo,
	initialHistory,
	undoable,
	type History,
	type HistoryAction,
} from '../../lib/board/history.ts';
import { cardClass, kindLabel } from '../../lib/board/kinds.ts';
import { resetsHistory, type BoardAction } from '../../lib/board/gestures.ts';
import {
	bandOrder,
	unboundStories,
	splitCellKey,
	storiesIn,
	UNASSIGNED,
	type BoardState,
	type CardKind,
	type Id,
} from '../../lib/board/state.ts';
import type { Product } from '../../lib/products.ts';
import { deliveryKindLabel, effectiveSpace, ticketKindOf, type StoryStatus } from '../../lib/storymap/model.ts';
import { parse } from '../../lib/storymap/parser.ts';
import type { StoryMapDocument } from '../../lib/storymap/model.ts';
import { StoryMapParseError, type Problem } from '../../lib/storymap/problems.ts';
import { EMPTY_SOURCE, SAMPLE_SOURCE } from '../../lib/storymap/sample.ts';

import { BoardGrid } from './BoardGrid.tsx';
import { BASE_FONT } from './BoardGrid.tsx';
import { Divider } from './Divider.tsx';
import { Editor } from './Editor.tsx';
import { SourceProblems } from './SourceProblems.tsx';
import { StoreState } from './StoreState.tsx';
import { PublishDialog, type PublishProgress } from './PublishDialog.tsx';
import { Legend } from './Legend.tsx';

import { Toolbar } from './Toolbar.tsx';

/** How far back undo goes. Snapshots are cheap; see history.ts. */
const HISTORY_LIMIT = 100;
/** How long the board must be still before autosave writes. See the effect. */
const AUTOSAVE_DELAY_MS = 1_000;

/**
 * Zoom stops, as multipliers of the board's base font size.
 *
 * A fixed ladder rather than a continuous slider: the useful question is "show
 * me more of the board" or "let me read this", and a handful of stops answers it
 * without anyone fiddling to find a round number.
 *
 * The range starts at 100% and only goes up. It used to run from 60%, on the
 * theory that shrinking is how you fit a wide board on a screen — but the board
 * has since grown two better answers to that, in the narrow columns and in
 * detail that stays collapsed until asked for. Neither of those costs any
 * legibility, and shrinking below a readable size costs nothing else.
 */
const ZOOM_STOPS = [1, 1.15, 1.3, 1.45, 1.6] as const;
const DEFAULT_ZOOM_INDEX = 0;

/**
 * One entry in the undo stack: what the visitor did, and the file it produced.
 *
 * The gesture travels alongside the text because history still needs to know
 * *which* gesture it was — an import clears the stack, an edit does not. The
 * fold itself is a replace: the splice has already happened by the time a
 * commit gets here.
 */
interface Commit {
	readonly action: BoardAction;
	readonly text: string;
}

const step = undoable<string, Commit>((_, commit) => commit.text, {
	limit: HISTORY_LIMIT,
	resets: (commit) => resetsHistory(commit.action),
});

/** What an unwritten map is, so the projection always has something to build. */
const EMPTY_DOCUMENT = parse(EMPTY_SOURCE);

/**
 * The product list and the registry's address are passed in from the Astro page
 * rather than fetched here.
 *
 * The island could fetch them itself, and that would keep the board page
 * prerendered — but it would make doc-registry a *browser-facing* address and
 * lean on its CORS defaults, which are Strapi's out-of-the-box `origin: '*'` and
 * which nobody in this repo has consciously decided. Reading it server-side
 * keeps the call inside the cluster, where the existing REGISTRY_API_URL
 * convention already applies.
 */
export interface StoryMapBoardProps {
	readonly products: readonly Product[];
	readonly productsUnavailable: string | null;
	readonly registryUrl: string;
	/**
	 * Whether a ticketing system is configured for this deployment.
	 *
	 * Passed down rather than probed from here: the address is in-cluster and the
	 * browser never sees it. All the board needs to know is whether asking is
	 * worth offering — see the disabled "Create a ticket" entry in BoardGrid.
	 */
	readonly ticketingConfigured: boolean;
}

export default function StoryMapBoard({
	products,
	productsUnavailable,
	registryUrl,
	ticketingConfigured,
}: StoryMapBoardProps) {
	/*
	 * The document is the text. Everything else on this screen is derived.
	 *
	 * History holds *source strings* rather than board states, which is the whole
	 * of what changed here: a step back is the file as it was, so undo takes back
	 * a drag and a typed line in exactly the same way. `History<T>` was already
	 * generic, so it needed nothing.
	 */
	const [history, send] = useReducer(
		step as (state: History<string>, action: Commit | HistoryAction) => History<string>,
		undefined,
		() => initialHistory(EMPTY_SOURCE),
	);
	const source = history.present;

	/**
	 * The last parse that succeeded, and whether the text has moved on since.
	 *
	 * The board keeps drawing the last good document while the text is broken.
	 * That is what lets somebody type a half-finished line without the map
	 * disappearing underneath them — and the problems panel says the board is
	 * behind, so the state is never a silent lie.
	 */
	const parsed = useMemo(() => {
		try {
			return { document: parse(source), problems: [] as readonly Problem[] };
		} catch (error) {
			if (!(error instanceof StoryMapParseError)) throw error;
			return { document: null, problems: error.problems };
		}
	}, [source]);

	const lastGood = useRef<StoryMapDocument | null>(null);
	if (parsed.document !== null) lastGood.current = parsed.document;

	const document_ = parsed.document ?? lastGood.current;
	const problems = parsed.problems;
	const stale = parsed.document === null && lastGood.current !== null;

	/**
	 * The board, projected from the parsed document.
	 *
	 * Rebuilt on every parse, which is affordable because ids are positional —
	 * see `convert.ts`. A card nobody moved keeps its id across the rebuild, so
	 * React keeps its element, dnd-kit keeps its drag and an open card menu stays
	 * open while somebody types in the pane beside it.
	 */
	const board = useMemo(() => toBoard(document_ ?? EMPTY_DOCUMENT), [document_]);

	/**
	 * The card whose text the source pane is emphasising.
	 *
	 * Held as a kind and an id rather than as a span, because the span is a fact
	 * about the *current* parse and this outlives several of them: a card stays
	 * selected while you type in the pane beside it, and positional ids mean the
	 * id still names the same card as long as nothing above it moved.
	 */
	const [selected, setSelected] = useState<{ kind: CardKind | 'delivery'; id: Id } | null>(null);

	/**
	 * Where the selected card is written, for the source pane to emphasise.
	 *
	 * The whole declaration — keyword through closing brace — rather than just
	 * the title, because what is selected is the card, and the card is all of it:
	 * its annotations, its need, its notes. Null when nothing is selected, when
	 * the text no longer parses, or when the id names a card that is no longer
	 * there. All three mean the same thing to the pane: emphasise nothing.
	 *
	 * This is the payoff of the rewrite in one expression. Before the spans, an
	 * answer to "which text is this card?" did not exist anywhere in the app.
	 */
	const highlight = useMemo(() => {
		if (selected === null || document_ === null) return null;

		if (selected.kind === 'delivery') {
			const at = deliveryPositionOf(selected.id);
			return at === null ? null : (document_.deliveries[at]?.span ?? null);
		}
		if (selected.kind === 'activity') {
			const at = activityPositionOf(selected.id);
			return at === null ? null : (document_.activities[at]?.span ?? null);
		}
		if (selected.kind === 'step') {
			const at = stepPositionOf(selected.id);
			return at === null ? null : (document_.activities[at.activity]?.steps[at.step]?.span ?? null);
		}
		const at = storyPositionOf(selected.id);
		return at === null
			? null
			: (document_.activities[at.activity]?.steps[at.step]?.stories[at.story]?.span ?? null);
	}, [selected, document_]);

	/** Which panels are showing, and how the width is divided between them. */
	const [panes, setPanes] = useState<storage.Panes>('both');
	const [split, setSplit] = useState(42);
	const [revealLine, setRevealLine] = useState<number | null>(null);
	const [problemsCollapsed, setProblemsCollapsed] = useState(false);
	// Where tickets are raised. Needed by both the per-card actions and the
	// publisher, so it is computed once beside the board rather than in each.
	const space = effectiveSpace(board);

	const [dragging, setDragging] = useState<{ id: Id; title: string; kind: 'activity' | 'step' | 'story' } | null>(null);
	// "Changed since the last import or export." The only state doc-sm can lose.
	const [dirty, setDirty] = useState(false);
	/** What the browser's copy last said, or why it could not be written. */
	const [stored, setStored] = useState<{ at: number } | { error: string } | null>(null);
	const [opening, setOpening] = useState(false);
	/**
	 * The saved list, read when the dialog opens rather than on every render.
	 *
	 * `saved()` walks every key at this origin, which is cheap but not free, and
	 * nothing on the board changes it except this component — so it is refreshed
	 * where it can change: opening the dialog, and deleting from it.
	 */
	/*
	 * Read when the panel opens rather than kept in step as the board changes.
	 * Another tab may have written since, and a stale account of the store is
	 * worse than no account of it.
	 */
	const [store, setStore] = useState<storage.Inventory>({ boards: [], bytes: 0 });
	const [ticketError, setTicketError] = useState<string | null>(null);
	// Counts documents, not edits: see the note on BoardGrid's documentKey.
	const [documentKey, setDocumentKey] = useState(0);
	const [publishing, setPublishing] = useState(false);
	const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
	/**
	 * Which cards have their detail open.
	 *
	 * View state, not board state: expanding a note is not an edit, so it is not
	 * undoable and never reaches the exported file. **Everything starts
	 * collapsed**, which is what keeps a board of eighty stories the size of
	 * eighty titles.
	 *
	 * A set of open ids rather than a flag per card, so "hide all" is one empty
	 * set and cards that arrive from an import start collapsed without anyone
	 * having to remember to reset them.
	 */
	const [expanded, setExpanded] = useState<ReadonlySet<Id>>(() => new Set());
	const [fullscreen, setFullscreen] = useState(false);
	/**
	 * The board's own light/dark override, or `null` to follow the page.
	 *
	 * Read from storage in an effect rather than in the initialiser, because this
	 * component is `client:only` today but the initialiser would be the first
	 * thing to break if it ever were not — `localStorage` does not exist while a
	 * component is being rendered on a server, and a crash at import time takes
	 * the whole island with it.
	 */
	const [boardTheme, setBoardTheme] = useState<storage.BoardTheme | null>(null);
	/**
	 * The notation row. Shown until somebody says otherwise — see `loadLegend`.
	 *
	 * ba-ddd-mapper's toggle, in the same place on the bar and with the same
	 * default: the person who needs a legend most is the one who has not seen
	 * this board before, and they will not go looking for a switch.
	 */
	const [legend, setLegend] = useState(true);
	/** What the page is showing right now, so the toggle can offer the opposite. */
	const [pageIsDark, setPageIsDark] = useState(false);
	const stage = useRef<HTMLDivElement>(null);
	const [progress, setProgress] = useState<PublishProgress | null>(null);

	/**
	 * A gesture from the grid, carried out on the text.
	 *
	 * The action shapes are unchanged, which is why nothing below the toolbar had
	 * to be rewritten — see `apply.ts`. What changed is what happens to one: it
	 * is translated into a splice, and the new text is what history records.
	 *
	 * A gesture against a document that does not currently parse is dropped. The
	 * spans it would splice describe text that has since been edited by hand, and
	 * applying them would write to the wrong bytes. The problems panel already
	 * says the board is behind; the grid is a read-only picture until it is not.
	 */
	const dispatch = useCallback(
		(action: BoardAction) => {
			if (!isEdit(action) || parsed.document === null) return;
			const next = applyAction(source, parsed.document, board, action);
			if (next === source) return;
			send({ action, text: next });
			setDirty(true);
		},
		[source, parsed.document, board],
	);

	/** Text typed in the pane. Recorded exactly as a gesture is. */
	const edit = useCallback(
		(next: string) => {
			if (next === source) return;
			send({ action: { type: 'applyText', text: next }, text: next });
			setDirty(true);
		},
		[source],
	);

	/* ---- import and export ------------------------------------------------ */

	/**
	 * Open a file: the text becomes the document, whatever state it is in.
	 *
	 * It no longer refuses a file that does not parse, and that is the change
	 * this rewrite makes possible. The old contract — "a failed import never
	 * touches the board" — existed because the board *was* the state and a
	 * half-parsed file could not become one. Now the file is the state: it opens
	 * in the pane with its problems listed beneath it, which is the only way
	 * anybody was ever going to fix it.
	 */
	const load = useCallback((text: string) => {
		send({ action: { type: 'import', text }, text });
		setDocumentKey((n) => n + 1);
		setDirty(false);
	}, []);

	/**
	 * The file, exported exactly as it sits in the pane.
	 *
	 * No serialisation step. What you have been editing is what lands on disk —
	 * comments, blank lines, your own alignment and all — which is the thing the
	 * old export could not promise.
	 */
	const exportFile = useCallback(() => {
		downloadText(filenameFor(board.product, board.title), source);
		setDirty(false);
	}, [board.product, board.title, source]);

	/* ---- tickets ----------------------------------------------------------- */

	/**
	 * Link a story to a ticket that already exists, or clear the link.
	 *
	 * A prompt, deliberately. doc-sm does not issue ticket ids, so this is
	 * transcription — somebody reading a key off the tracker and typing it in —
	 * and a prompt is the smallest honest thing for that. It becomes a proper
	 * field the day linking is something people do dozens of times a session.
	 */
	const linkTicket = useCallback(
		(kind: CardKind, id: Id) => {
			const card = cardOf(board, kind, id);
			if (!card) return;
			const entered = window.prompt(
				`${capitalise(ticketKindOf[kind])} id, exactly as the ticketing system spells it.\nLeave it empty to unlink.`,
				card.ticket ?? '',
			);
			// Cancel is null and means "leave it alone"; an empty string is a
			// deliberate unlink. They are different answers and are treated so.
			if (entered === null) return;
			dispatch({ type: 'setTicket', kind, id, ticket: entered });
		},
		[board, dispatch],
	);

	/**
	 * Ask the ticketing system to raise a ticket for a story.
	 *
	 * Nothing here invents an id or a status: both come back from the call, and
	 * both are written exactly as received. If the call fails the story is left
	 * untouched — an unlinked story is a truthful state, and a half-linked one
	 * would not be.
	 */
	const createTicket = useCallback(
		async (kind: CardKind, id: Id) => {
			const card = cardOf(board, kind, id);
			if (!card) return;
			setTicketError(null);

			let payload: { id?: string; status?: StoryStatus; error?: string };
			try {
				const response = await fetch('/api/ticket', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					// The adapter cannot guess the issue type from a title.
					body: JSON.stringify({
						kind: ticketKindOf[kind],
						space,
						product: board.product,
						title: card.title,
					}),
				});
				payload = await response.json();
			} catch {
				setTicketError('Could not reach doc-sm to raise the ticket.');
				return;
			}

			if (!payload.id || !payload.status) {
				setTicketError(payload.error ?? 'The ticket could not be created.');
				return;
			}

			dispatch({ type: 'setTicket', kind, id, ticket: payload.id });
			dispatch({ type: 'setStatus', kind, id, status: payload.status });
		},
		[board, space, dispatch],
	);

	/* ---- detail ------------------------------------------------------------ */

	const detailed = useMemo(() => cardsWithDetail(board), [board]);
	// "Some are open" is the state the global control acts on: it collapses if
	// anything is showing, and expands otherwise. One button, and its meaning is
	// always the opposite of what you can currently see.
	const anyExpanded = detailed.some((id) => expanded.has(id));

	const toggleDetail = useCallback((id: Id) => {
		setExpanded((was) => {
			const next = new Set(was);
			if (!next.delete(id)) next.add(id);
			return next;
		});
	}, []);

	const toggleAllDetail = useCallback(() => {
		setExpanded(anyExpanded ? new Set() : new Set(detailed));
	}, [anyExpanded, detailed]);

	/* ---- zoom and fullscreen ----------------------------------------------- */

	const zoom = ZOOM_STOPS[zoomIndex] ?? 1;

	/**
	 * Fullscreen the board, not the page.
	 *
	 * `stage` is the whole component, not just the grid, and that is the point:
	 * anything outside the fullscreen element is simply not painted. Fullscreening
	 * the grid alone would take the toolbar with it — no zoom, no way back except
	 * Escape — and would make a dragged card vanish on pickup, because the
	 * DragOverlay renders beside the grid rather than inside it.
	 *
	 * The two dialogs are unaffected either way: `showModal()` puts them in the
	 * browser's top layer, which paints above a fullscreen element.
	 *
	 * State follows the *document*, never the click, because Escape and the
	 * browser's own chrome exit fullscreen without asking this component first.
	 */
	useEffect(() => {
		const sync = () => setFullscreen(document.fullscreenElement === stage.current);
		document.addEventListener('fullscreenchange', sync);
		return () => document.removeEventListener('fullscreenchange', sync);
	}, []);

	useEffect(() => setBoardTheme(storage.loadTheme()), []);
	useEffect(() => setLegend(storage.loadLegend()), []);

	/**
	 * Follow the OS while the board is not pinned.
	 *
	 * Subscribed rather than read once: somebody whose machine switches at sunset
	 * would otherwise be offered "switch to dark" by a button sitting on a board
	 * that had already gone dark around it.
	 */
	useEffect(() => {
		const query = window.matchMedia('(prefers-color-scheme: dark)');
		const sync = () => setPageIsDark(query.matches);
		sync();
		query.addEventListener('change', sync);
		return () => query.removeEventListener('change', sync);
	}, []);

	/**
	 * Pin the board to the opposite of what it is showing.
	 *
	 * A two-state control over three states, which is what makes it feel like the
	 * usual night/day switch: the first click pins whatever you asked for, and
	 * every click after that flips it. Returning to "follow the page" is not a
	 * third press — it is the reset the toolbar offers, because a three-way
	 * button whose third state is invisible is a button nobody can predict.
	 */
	const boardIsDark = boardTheme === null ? pageIsDark : boardTheme === 'dark';
	const flipTheme = useCallback(() => {
		const next: storage.BoardTheme = boardIsDark ? 'light' : 'dark';
		setBoardTheme(next);
		storage.saveTheme(next);
	}, [boardIsDark]);

	const toggleFullscreen = useCallback(() => {
		const element = stage.current;
		if (!element) return;
		if (document.fullscreenElement === element) {
			void document.exitFullscreen();
			return;
		}
		// Older Safari only has the prefixed form, and rejecting the promise is
		// the normal way a browser refuses — neither is worth an error message
		// here, because the board is entirely usable without fullscreen.
		const request =
			element.requestFullscreen ??
			(element as unknown as { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen;
		void request?.call(element)?.catch?.(() => undefined);
	}, []);

	/* ---- publishing -------------------------------------------------------- */

	const unbound = useMemo(() => unboundStories(board), [board]);

	/**
	 * Raise a ticket for every unbound story.
	 *
	 * Sequential, not parallel, and that is not timidity about load. Each ticket
	 * is recorded on the board the moment it comes back, so a failure at story
	 * seventeen leaves sixteen real tickets already written down rather than
	 * sixteen orphans nobody can find. Firing them all at once and awaiting the
	 * set would lose that ordering, and losing it means creating tickets in
	 * somebody's tracker that this board has no record of — the worst outcome
	 * this operation has.
	 *
	 * Failures do not stop the run. A story the tracker rejects is left unlinked
	 * and reported by name, and publishing again retries exactly those, because
	 * everything that succeeded now has a ticket and is no longer unbound.
	 */
	const publish = useCallback(async () => {
		if (space === null) return;
		const targets = unboundStories(board);
		const failures: { title: string; error: string }[] = [];
		setProgress({ done: 0, total: targets.length, failures: [], running: true });

		for (const [index, story] of targets.entries()) {
			let payload: { id?: string; status?: StoryStatus; error?: string };
			try {
				const response = await fetch('/api/ticket', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					// Publishing only ever raises stories today — see unboundStories.
					body: JSON.stringify({ kind: 'story', space, product: board.product, title: story.title }),
				});
				payload = await response.json();
			} catch {
				payload = { error: 'Could not reach doc-sm to raise the ticket.' };
			}

			if (payload.id && payload.status) {
				dispatch({ type: 'setTicket', kind: 'story', id: story.id, ticket: payload.id });
				dispatch({ type: 'setStatus', kind: 'story', id: story.id, status: payload.status });
			} else {
				failures.push({ title: story.title, error: payload.error ?? 'The ticket could not be created.' });
			}

			setProgress({ done: index + 1, total: targets.length, failures: [...failures], running: true });
		}

		setProgress({ done: targets.length, total: targets.length, failures, running: false });
	}, [board, space, dispatch]);

	/* ---- the browser's copy ------------------------------------------------ */

	const key = storageKeyOf(board);

	/**
	 * The text the store is known to hold.
	 *
	 * What autosave compares against, and the reason it does not key off `dirty`.
	 * `dirty` means "there are changes you have not *exported*" — it says so on
	 * the toolbar — which is a different question from "does the browser's copy
	 * match what is on screen". Keying the background save off it would mean an
	 * imported file that nobody then edited was never written at all.
	 */
	const savedText = useRef<string | null>(null);

	const persist = useCallback((state: BoardState, text: string) => {
		const result = storage.save(storageKeyOf(state), text);
		if (storage.failed(result)) {
			setStored({ error: result.error });
			return;
		}
		savedText.current = text;
		setStored({ at: Date.now() });
	}, []);

	/**
	 * Follow a rename, so one board keeps one entry.
	 *
	 * The key is derived from the product and the title, so editing either moves
	 * the board. Without this the next autosave would write the new key and leave
	 * the old one behind, and a board renamed twice would appear three times in
	 * the open dialog — two of them stale, with names all equally plausible.
	 *
	 * A ref rather than state: this fires *because* the key changed, and storing
	 * the previous one in state would schedule a second render to record
	 * something no one renders.
	 */
	const previousKey = useRef<string | null>(null);
	useEffect(() => {
		const was = previousKey.current;
		previousKey.current = key;
		if (was !== null && was !== key) storage.rename(was, key);
	}, [key]);

	/**
	 * Autosave, a second after the last change.
	 *
	 * Debounced rather than written on every action: dragging a story fires one
	 * action, but typing a title fires one per keystroke, and serialising the
	 * whole map on each of them would be work nobody asked for.
	 *
	 * One second is short enough that the answer to "did I lose it?" is no, and
	 * long enough that a burst of typing writes once. The timer is cleared on
	 * every change, so the write happens when the room stops moving.
	 *
	 * Skipped while the board is untouched. A visitor who opens doc-sm, looks
	 * around and leaves should not find an "untitled" board saved in their
	 * browser afterwards — an empty board is not work, and autosave is for work.
	 */
	useEffect(() => {
		// An untouched empty board is not work to be preserved, and saving it would
		// put an "Untitled story map" in the store panel of everybody who ever
		// opened the page. ba-ddd-mapper's `blank(source)` guard.
		if (source === EMPTY_SOURCE || source === savedText.current) return;
		const timer = setTimeout(() => persist(board, source), AUTOSAVE_DELAY_MS);
		return () => clearTimeout(timer);
	}, [board, source, persist]);

	/**
	 * Write now, rather than at the end of the debounce.
	 *
	 * Called whenever this component is about to stop being the only thing that
	 * knows the current text — the tab closing, or the store panel opening
	 * another board over this one.
	 */
	const flush = useCallback(() => {
		if (source === EMPTY_SOURCE || source === savedText.current) return;
		persist(board, source);
	}, [board, source, persist]);

	// Registered once and read through a ref, so the listener is not torn down
	// and rebuilt on every keystroke.
	const flushNow = useRef(flush);
	flushNow.current = flush;
	useEffect(() => {
		const onHide = () => flushNow.current();
		window.addEventListener('pagehide', onHide);
		return () => window.removeEventListener('pagehide', onHide);
	}, []);

	/**
	 * Reopen whatever this browser had open last.
	 *
	 * Once, on mount, and only when there is something to reopen. This is the
	 * point of autosave: a closed laptop or a crashed tab should cost nothing,
	 * and a person who has to remember to reopen their own board after a crash is
	 * exactly the person who will not.
	 *
	 * A stored entry that no longer parses is *left alone* rather than dropped.
	 * It is the only copy, it is recoverable by hand from devtools, and silently
	 * discarding somebody's session because this version reads the format
	 * differently would be the worst thing this module could do.
	 */
	useEffect(() => {
		const last = storage.lastOpened();
		if (last === null) return;
		const text = storage.load(last);
		if (text === null) return;
		send({ action: { type: 'import', text }, text });
		setDocumentKey((n) => n + 1);
		previousKey.current = last;
		// It came *from* the store, so the store already holds it. Without this
		// the first autosave would write the same bytes back for no reason.
		savedText.current = text;
		// Mount only. `board` is deliberately not a dependency: this restores the
		// last session, it does not keep re-reading storage.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/* ---- the dirty guard --------------------------------------------------- */

	useEffect(() => {
		// Registered only while there is something to lose. A warning on a board
		// nobody has touched trains people to click through warnings, which is
		// worse than not having one.
		if (!dirty) return;
		const guard = (event: BeforeUnloadEvent) => {
			// Every browser ignores a custom message and shows its own wording.
			// preventDefault() is the whole API; do not try to phrase it.
			event.preventDefault();
		};
		window.addEventListener('beforeunload', guard);
		return () => window.removeEventListener('beforeunload', guard);
	}, [dirty]);

	/* ---- keyboard shortcuts ------------------------------------------------ */

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (!(event.metaKey || event.ctrlKey)) return;
			// A field with focus has its own undo stack, and stealing it is worse
			// than not offering a shortcut at all.
			const target = event.target as HTMLElement | null;
			if (target?.closest('input, textarea, [contenteditable="true"]')) return;

			const key = event.key.toLowerCase();
			if (key === 'z' && !event.shiftKey) {
				event.preventDefault();
				send({ type: 'undo' });
			} else if ((key === 'z' && event.shiftKey) || key === 'y') {
				event.preventDefault();
				send({ type: 'redo' });
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);

	/* ---- drag and drop ----------------------------------------------------- */

	const sensors = useSensors(
		// 6px before a drag begins. Load-bearing, not tuning: a card is also the
		// click target that opens its inline editor, and without a threshold every
		// click starts a drag and the title never opens.
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	);

	/**
	 * Four sortable axes share one DndContext, so a drag must only ever collide
	 * with droppables that accept what is being dragged. Without this filter a
	 * story would happily land on the activity backbone.
	 */
	const collisionDetection: CollisionDetection = useCallback((args) => {
		const type = args.active.data.current?.type;
		const containers = args.droppableContainers.filter((container) => {
			const data = container.data.current;
			if (type === 'story') return data?.accepts === 'story' || data?.type === 'story';
			return data?.type === type;
		});
		return closestCenter({ ...args, droppableContainers: containers });
	}, []);

	const onDragStart = useCallback(
		(event: DragStartEvent) => {
			const type = event.active.data.current?.type as 'activity' | 'step' | 'story' | 'release' | undefined;
			if (type === undefined || type === 'release') return setDragging(null);
			const id = String(event.active.id);
			const title =
				type === 'story'
					? board.stories[id]?.title
					: type === 'step'
						? board.steps[id]?.title
						: board.activities[id]?.title;
			setDragging(title === undefined ? null : { id, title, kind: type });
		},
		[board],
	);

	const onDragEnd = useCallback(
		(event: DragEndEvent) => {
			setDragging(null);
			const { active, over } = event;
			if (!over) return;

			const activeData = active.data.current;
			const overData = over.data.current;
			const activeId = String(active.id);
			const overId = String(over.id);
			if (activeId === overId && activeData?.type !== 'story') return;

			if (activeData?.type === 'story') {
				const from = String(activeData.cell);
				// `over` is either another story (drop beside it) or a cell (append).
				const to = overData?.type === 'story' ? String(overData.cell) : overId;
				if (!to.includes('|')) return;

				const { stepId, band } = splitCellKey(to);
				const target = storiesIn(board, stepId, band);
				const index =
					overData?.type === 'story' ? Math.max(0, target.indexOf(overId)) : target.length;
				if (from === to && target[index] === activeId) return;
				dispatch({ type: 'moveStory', storyId: activeId, from, to, index });
				return;
			}

			if (activeData?.type === 'step') {
				const fromActivityId = String(activeData.activityId);
				const toActivityId = String(overData?.activityId ?? fromActivityId);
				const target = board.activities[toActivityId]?.stepOrder ?? [];
				const index = target.indexOf(overId);
				dispatch({
					type: 'moveStep',
					stepId: activeId,
					fromActivityId,
					toActivityId,
					index: index === -1 ? target.length : index,
				});
				return;
			}

			if (activeData?.type === 'activity') {
				const index = board.activityOrder.indexOf(overId);
				if (index !== -1) dispatch({ type: 'moveActivity', activityId: activeId, index });
				return;
			}

			if (activeData?.type === 'delivery') {
				const index = board.deliveryOrder.indexOf(overId);
				if (index !== -1) dispatch({ type: 'moveDelivery', deliveryId: activeId, index });
			}
		},
		[board, dispatch],
	);

	/**
	 * dnd-kit's defaults say "Draggable item y7 was moved over droppable area
	 * p3|r2", which is worse than silence. These are the difference between
	 * keyboard dragging being usable and being theatre.
	 */
	const announcements: Announcements = useMemo(
		() => ({
			onDragStart: ({ active }) => `Picked up ${nameOf(board, String(active.id))}.`,
			onDragOver: ({ active, over }) =>
				over ? `${nameOf(board, String(active.id))} is over ${placeOf(board, String(over.id))}.` : undefined,
			onDragEnd: ({ active, over }) =>
				over
					? `${nameOf(board, String(active.id))} was dropped on ${placeOf(board, String(over.id))}.`
					: `${nameOf(board, String(active.id))} was dropped.`,
			onDragCancel: ({ active }) => `Moving ${nameOf(board, String(active.id))} was cancelled.`,
		}),
		[board],
	);

	const empty = board.activityOrder.length === 0 && board.deliveryOrder.length === 0;

	return (
		/*
		 * `data-theme` is the whole override.
		 *
		 * `dark:` resolves against the nearest ancestor that carries it — see the
		 * `@custom-variant` in global.css — so every component under here follows
		 * the board's theme without knowing that a board theme exists. Absent
		 * while the board follows the page, which is why the default behaviour is
		 * byte-for-byte what it was before this was added.
		 *
		 * It sits on the stage rather than on the grid so the toolbar, the legend
		 * and the dialogs come with it: they are part of the board, and a light
		 * board under a dark toolbar would look like a rendering fault.
		 *
		 * ## The stage must state its own colours, not inherit them
		 *
		 * `bg-white text-ink dark:bg-night dark:text-slate-100` here is not
		 * decoration — it is what makes the override sound.
		 *
		 * Anything inside the board that does not set a colour inherits one, and
		 * the nearest one used to be on `<body>`. Body's `dark:` resolves at body
		 * level, where there is no `data-theme`, so it follows the operating
		 * system. Pin the board to daylight on a machine in dark mode and the
		 * board's own surfaces correctly turned white while every unstyled string
		 * inside them stayed near-white, inherited from a body that had never
		 * heard of the override. The swimlane names went first, because they were
		 * the largest text on the board carrying no colour class of its own.
		 *
		 * Restating the pair here stops the inheritance at the boundary: the whole
		 * subtree now takes its foreground and background from the same attribute
		 * that decides its variants. The values are the ones `<body>` uses, so a
		 * board that is *not* pinned looks exactly as it did before.
		 */
		<div
			ref={stage}
			data-theme={boardTheme ?? undefined}
			className={`flex flex-col gap-4 bg-white text-ink dark:bg-night dark:text-slate-100 ${
				fullscreen ? 'h-screen overflow-hidden p-4' : ''
			}`}
		>
			<Toolbar
				title={board.title}
				product={board.product}
				products={products}
				productsUnavailable={productsUnavailable}
				registryUrl={registryUrl}
				onProduct={(product) => dispatch({ type: 'setProduct', product })}
				dirty={dirty}
				canUndo={canUndo(history)}
				canRedo={canRedo(history)}
				onTitle={(title) => dispatch({ type: 'setMapTitle', title })}
				onPickFile={async (file, input) => {
					const text = await readTextFile(file);
					// A `change` event does not fire for the same file twice, so
					// "fix it and import again" would silently do nothing.
					clearFileInput(input);
					load(text);
				}}
				onExport={exportFile}
				panes={panes}
				onPanes={(next) => {
					setPanes(next);
					storage.savePanes(next);
				}}
				space={board.space}
				spacePlaceholder={board.product ?? ''}
				onSpace={(next) => dispatch({ type: 'setSpace', space: next })}
				onPublish={() => {
					setProgress(null);
					setPublishing(true);
				}}
				publishCount={unbound.length}
				publishReason={publishBlockedReason(ticketingConfigured, space, unbound.length)}
				onLoadSample={() => load(SAMPLE_SOURCE)}
				onOpenStore={() => {
					setStore(storage.inventory());
					setOpening(true);
				}}
				saveState={stored}
				onAddActivity={() => dispatch({ type: 'addActivity', index: board.activityOrder.length })}
				onAddSprint={() => dispatch({ type: 'addDelivery', kind: 'sprint', index: board.deliveryOrder.length })}
				onAddRelease={() => dispatch({ type: 'addDelivery', kind: 'release', index: board.deliveryOrder.length })}
				onUndo={() => send({ type: 'undo' })}
				onRedo={() => send({ type: 'redo' })}
				zoom={zoom}
				canZoomIn={zoomIndex < ZOOM_STOPS.length - 1}
				canZoomOut={zoomIndex > 0}
				onZoomIn={() => setZoomIndex((i) => Math.min(i + 1, ZOOM_STOPS.length - 1))}
				onZoomOut={() => setZoomIndex((i) => Math.max(i - 1, 0))}
				onZoomReset={() => setZoomIndex(DEFAULT_ZOOM_INDEX)}
				fullscreen={fullscreen}
				onToggleFullscreen={toggleFullscreen}
				boardIsDark={boardIsDark}
				themePinned={boardTheme !== null}
				onFlipTheme={flipTheme}
				onFollowPage={() => {
					setBoardTheme(null);
					storage.saveTheme(null);
				}}
				legendShown={legend}
				onToggleLegend={() => {
					setLegend(!legend);
					storage.saveLegend(!legend);
				}}
				detailShown={anyExpanded}
				canToggleDetail={detailed.length > 0}
				onToggleAllDetail={toggleAllDetail}
			/>

			{legend && <Legend />}

			{ticketError !== null && (
				<p
					role="alert"
					className="rounded-2xl border border-critical/40 bg-critical/5 px-4 py-3 text-sm dark:border-critical/50"
				>
					{ticketError}{' '}
					<button
						type="button"
						onClick={() => setTicketError(null)}
						className="font-semibold text-brand underline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
					>
						Dismiss
					</button>
				</p>
			)}

			<PublishDialog
				open={publishing}
				space={space ?? ''}
				stories={unbound}
				progress={progress}
				onPublish={publish}
				onClose={() => setPublishing(false)}
			/>

			<StoreState
				open={opening}
				state={store}
				current={key}
				onOpen={(pick) => {
					// Before this board stops being the one on screen: there may be up
					// to a second of typing still sitting in the debounce.
					flush();
					const text = storage.load(pick);
					setOpening(false);
					if (text !== null) {
						load(text);
						savedText.current = text;
					}
				}}
				onDelete={(pick) => {
					storage.remove(pick);
					// Re-read rather than splice the row out: if the delete did not take
					// — a store that throws is why every call here is wrapped — the row
					// is still there, which is the truth.
					setStore(storage.inventory());
				}}
				onClose={() => setOpening(false)}
			/>

			<div className="flex min-h-0 flex-1 flex-col lg:flex-row">
				{/* The source first in the DOM and first when stacked: on a narrow
				    viewport this is a thing you read, and the text is the map. */}
				{panes !== 'board' && (
					<section
						aria-label="Source"
						className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-300 dark:border-slate-700 ${
							panes === 'both' ? '' : 'flex-1'
						}`}
						style={panes === 'both' ? { flexBasis: `${split}%` } : undefined}
					>
						<div className="min-h-0 flex-1 overflow-auto">
							<Editor
								value={source}
								onChange={edit}
								problems={problems}
								revealLine={revealLine}
								highlight={highlight}
							/>
						</div>
						<SourceProblems
							problems={problems}
							stale={stale}
							collapsed={problemsCollapsed}
							onToggle={() => setProblemsCollapsed((was) => !was)}
							onReveal={(line) => setRevealLine(line)}
						/>
					</section>
				)}

				{panes === 'both' && (
					<Divider
						onMove={(percent) => {
							setSplit(percent);
							storage.saveSplit(percent);
						}}
					/>
				)}

				{panes !== 'source' && (
					/*
					 * `min-w-0`, and it is load-bearing: a flex item will not shrink
					 * below its content's minimum width, and the grid is `min-w-max`.
					 * Without it this section demands the whole grid's width and the
					 * source pane next to it is squeezed to nothing.
					 */
					<section aria-label="The map" className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
			{empty ? (
				<EmptyBoard onLoadSample={() => load(SAMPLE_SOURCE)} onAddActivity={() => dispatch({ type: 'addActivity', index: 0 })} />
			) : (
				<DndContext
					sensors={sensors}
					collisionDetection={collisionDetection}
					onDragStart={onDragStart}
					onDragEnd={onDragEnd}
					onDragCancel={() => setDragging(null)}
					accessibility={{ announcements }}
				>
					{/* In fullscreen this is the flex child that gets the leftover
					    height, so the board fills the screen under the toolbar rather
					    than keeping its 75vh cap. min-h-0 is what lets a flex child
					    actually shrink to its container. */}
					<div className={fullscreen ? 'flex min-h-0 flex-1 flex-col' : undefined}>
						<BoardGrid
							board={board}
							dispatch={dispatch}
							onLinkTicket={linkTicket}
							onCreateTicket={createTicket}
							ticketingConfigured={ticketingConfigured}
							zoom={zoom}
							fullscreen={fullscreen}
							documentKey={documentKey}
							expanded={expanded}
							onToggleDetail={toggleDetail}
							selected={selected}
							onSelect={setSelected}
						/>

						{/* Mandatory, not decorative: the board scrolls, and a card
						    dragged by transform inside an overflow:auto container is
						    clipped at its edge. The overlay renders outside the flow
						    and is the only way a card crosses the board. */}
						<DragOverlay dropAnimation={null}>
							{dragging && (
								<div
									// Same base as the board, so the card being dragged is the
									// size of the cards it is being dragged between.
									style={{ fontSize: `${BASE_FONT * zoom}px` }}
									className={`rounded-[0.4em] border px-[0.55em] py-[0.4em] text-[1em] shadow-lg ${cardClass[dragging.kind]}`}
								>
									{dragging.title}
								</div>
							)}
						</DragOverlay>
					</div>
				</DndContext>
			)}
					</section>
				)}
			</div>
		</div>
	);
}

function EmptyBoard({ onLoadSample, onAddActivity }: { onLoadSample: () => void; onAddActivity: () => void }) {
	return (
		<div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-600">
			<h2 className="text-lg font-semibold">No map open</h2>
			<p className="mx-auto mt-2 max-w-prose text-ink-muted dark:text-slate-400">
				Import a <code>.storymap</code> file, start from the example, or add the first activity. Nothing is
				stored on the server — the file you export is the map.
			</p>
			<div className="mt-5 flex flex-wrap justify-center gap-3">
				<button
					type="button"
					onClick={onLoadSample}
					className="rounded-full bg-brand px-5 py-2.5 font-semibold text-white transition hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand motion-reduce:transition-none"
				>
					Load the example
				</button>
				<button
					type="button"
					onClick={onAddActivity}
					className="rounded-full border border-slate-300 px-5 py-2.5 font-semibold transition hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand motion-reduce:transition-none dark:border-slate-600 dark:hover:border-sky-400 dark:hover:text-sky-400"
				>
					Add an activity
				</button>
			</div>
		</div>
	);
}

/** Why the publish control is unavailable, or undefined when it is available. */
/** The card behind an id, whichever row it is on. */
function cardOf(
	board: BoardState,
	kind: CardKind,
	id: Id,
): { title: string; ticket: string | null } | undefined {
	if (kind === 'activity') return board.activities[id];
	if (kind === 'step') return board.steps[id];
	return board.stories[id];
}

function capitalise(word: string): string {
	return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

function publishBlockedReason(
	configured: boolean,
	space: string | null,
	count: number,
): string | undefined {
	if (!configured) return 'No ticketing system is configured for doc-sm.';
	if (space === null) return 'Pick a product, or set a ticketing space, first.';
	if (count === 0) return 'Every story already has a ticket.';
	return undefined;
}

/** Where this board belongs in storage. One derivation, three callers. */
function storageKeyOf(board: BoardState): string {
	return storage.storageKey(board.product, board.title);
}

function nameOf(board: BoardState, id: string): string {
	if (board.stories[id]) return `${kindLabel.story} ${board.stories[id]!.title}`;
	if (board.steps[id]) return `${kindLabel.step} ${board.steps[id]!.title}`;
	if (board.activities[id]) return `${kindLabel.activity} ${board.activities[id]!.title}`;
	const delivery = board.deliveries[id];
	if (delivery) return `${deliveryKindLabel[delivery.kind]} ${delivery.title}`;
	return 'the card';
}

function placeOf(board: BoardState, id: string): string {
	if (id.includes('|')) {
		const { stepId, band } = splitCellKey(id);
		const stepTitle = board.steps[stepId]?.title ?? 'a step';
		const bandTitle = band === UNASSIGNED ? 'below the line' : board.deliveries[band]?.title ?? 'a band';
		return `${stepTitle}, ${bandTitle}`;
	}
	const found = bandOrder(board).includes(id) ? board.deliveries[id]?.title : undefined;
	return found ? `the ${found} band` : nameOf(board, id);
}
