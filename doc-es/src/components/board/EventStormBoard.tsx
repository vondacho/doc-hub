/**
 * The board island — doc-es's one hydrated component.
 *
 * The same shape as doc-sm's and doc-em's, for the same reason: a board is
 * edited by direct manipulation, and there is no URL or form that expresses
 * "this note belongs earlier on the wall than that one". Every other page in
 * doc-es is server-rendered HTML with no script attached.
 *
 * Drag policy is theirs too — state is untouched until `onDragEnd`, which
 * computes one index and dispatches one action, so a drag is one undo step
 * rather than a dozen.
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
import { AgentPanel } from '../agent/AgentPanel.tsx';
import * as storage from '../../lib/storage.ts';
import { format as formatSource } from '../../lib/format.ts';
import { lanePositionOf, positionOf, toBoard } from '../../lib/board/convert.ts';
import { applyAction, isEdit } from '../../lib/board/apply.ts';
import {
	canRedo,
	canUndo,
	initialHistory,
	undoable,
	type History,
	type HistoryAction,
} from '../../lib/board/history.ts';
import { cardClass } from '../../lib/board/kinds.ts';
import { resetsHistory, type BoardAction } from '../../lib/board/gestures.ts';
import { cardsWithDetail, type BoardState, type Id } from '../../lib/board/state.ts';
import { cardLabel, type CardKind, type EventStormDocument } from '../../lib/eventstorm/model.ts';
import { Legend } from './Legend.tsx';
import { parse } from '../../lib/eventstorm/parser.ts';
import { EventStormParseError, type Problem } from '../../lib/eventstorm/problems.ts';
import { SAMPLE_SOURCE, freshSource } from '../../lib/eventstorm/sample.ts';
import { EMPTY_SOURCE } from '../../lib/eventstorm/sample.ts';
import { BASE_FONT, BoardGrid } from './BoardGrid.tsx';
import { StoreState } from './StoreState.tsx';
import { Divider } from './Divider.tsx';
import { DEFAULT_TEXT_SIZE, Editor } from './Editor.tsx';
import { SourceProblems } from './SourceProblems.tsx';
import type { Product } from '../../lib/products.ts';
import { Toolbar } from './Toolbar.tsx';

const HISTORY_LIMIT = 100;
/** How long the board must be still before autosave writes. See the effect. */
const AUTOSAVE_DELAY_MS = 1_000;
/**
 * 100% to 160%, in five stops, and 100% is where the board opens.
 *
 * What 100% *is* in pixels is `BASE_FONT` in BoardGrid, which was raised so that
 * this board's natural size is its smallest — the stops here are unchanged, and
 * deliberately so: the toolbar prints these numbers, and they should keep
 * meaning "relative to how this board is meant to be read".
 */
const ZOOM_STOPS = [1, 1.15, 1.3, 1.45, 1.6] as const;
const DEFAULT_ZOOM_INDEX = 0;

/**
 * History over text.
 *
 * The "reducer" is a replace: every gesture has already been turned into a new
 * source string by the time it gets here, so folding it in is just taking the
 * new one. `undoable` supplies the stack, the limit and the reset rule.
 */
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

/** What an unwritten storm is, so the projection always has something to build. */
const EMPTY_DOCUMENT = parse(EMPTY_SOURCE);

export default function EventStormBoard({
	products,
	productsUnavailable,
	registryUrl,
	promptsUrl,
}: {
	/** The registered products, read once on the server. See src/lib/products.ts. */
	products: readonly Product[];
	/** Why the list is empty, when the registry could not be read. */
	productsUnavailable: string | null;
	/** The registry's admin UI, for the "register one" links. Browser-facing. */
	registryUrl: string;
	/** ba-portal's prompt page, for the assistant's link out. Browser-facing. */
	promptsUrl: string;
}) {
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
	 * That is what lets somebody type a half-finished line without the wall
	 * disappearing underneath them — and the problems panel says the board is
	 * behind, so the state is never a silent lie.
	 */
	const parsed = useMemo(() => {
		try {
			return { document: parse(source), problems: [] as readonly Problem[] };
		} catch (error) {
			if (!(error instanceof EventStormParseError)) throw error;
			return { document: null, problems: error.problems };
		}
	}, [source]);

	const lastGood = useRef<EventStormDocument | null>(null);
	if (parsed.document !== null) lastGood.current = parsed.document;

	const document_ = parsed.document ?? lastGood.current;
	const problems = parsed.problems;
	const stale = parsed.document === null && lastGood.current !== null;

	/**
	 * The board, projected from the parsed document.
	 *
	 * Rebuilt on every parse, which is affordable because ids are positional —
	 * see `convert.ts`. A card nobody moved keeps its id across the rebuild, so
	 * React keeps its element, dnd-kit keeps its drag and an open menu stays
	 * open while somebody types in the pane beside it.
	 */
	const board = useMemo(() => toBoard(document_ ?? EMPTY_DOCUMENT), [document_]);

	/**
	 * The card whose text the source pane is emphasising.
	 *
	 * A kind and an id rather than a span, because the span is a fact about the
	 * *current* parse and this outlives several of them: a note stays selected
	 * while you type in the pane beside it, and positional ids mean the id still
	 * names the same note as long as nothing above it moved.
	 */
	const [selected, setSelected] = useState<{ kind: 'lane' | 'card'; id: Id } | null>(null);

	/**
	 * Where the selected card is written, for the source pane to emphasise.
	 *
	 * The whole declaration — keyword, title, `@column` and any notes — rather
	 * than just the words on the note, because what is selected is the card and
	 * the card is all of it.
	 *
	 * Null when nothing is selected, when the text no longer parses, or when the
	 * id names a card that is no longer there. All three mean the same thing to
	 * the pane: emphasise nothing.
	 */
	const highlight = useMemo(() => {
		if (selected === null || parsed.document === null) return null;
		if (selected.kind === 'lane') {
			const at = lanePositionOf(selected.id);
			return at === null ? null : (parsed.document.lanes[at]?.span ?? null);
		}
		const at = positionOf(selected.id);
		return at === null ? null : (parsed.document.lanes[at.lane]?.cards[at.card]?.span ?? null);
	}, [selected, parsed.document]);

	/** Which panels are showing, and how the width is divided between them. */
	const [panes, setPanes] = useState<storage.Panes>('both');
	const [split, setSplit] = useState(42);
	/**
	 * The size the source is set in, chosen in the pane's own footer.
	 *
	 * A view preference like the legend and the split, and restored from the
	 * store the same way — the default is only what somebody who has never
	 * touched it gets.
	 */
	const [textSize, setTextSize] = useState(DEFAULT_TEXT_SIZE);
	const [revealLine, setRevealLine] = useState<number | null>(null);
	const [problemsCollapsed, setProblemsCollapsed] = useState(false);
	const [dirty, setDirty] = useState(false);
	const [stored, setStored] = useState<{ at: number } | { error: string } | null>(null);
	const [opening, setOpening] = useState(false);
	/**
	 * One message at a time, said out loud and then dismissed.
	 *
	 * ba-ddd-mapper's `note`, and its presentation: a strip across the top of the
	 * board, amber when something worked in a way you should know about and rose
	 * when it did not happen at all, with a ✕ that is the only way it goes away.
	 *
	 * Not a toast: a message that removes itself on a timer is a message the
	 * person who looked away has not read, and every one of these is about work
	 * they have not exported. Not a `confirm()` either — nothing here is a
	 * question, and blocking the event loop to say something is a way of being
	 * ignored.
	 *
	 * Distinct from the save line in the toolbar, which the mapper also keeps
	 * separate. That one is a standing condition — the browser's copy is or is
	 * not being written — and it belongs beside the title it is about, not in a
	 * strip that gets dismissed.
	 */
	const [note, setNote] = useState<{ kind: 'warn' | 'error'; text: string } | null>(null);
	/*
	 * Read when the panel opens rather than kept in step as the board changes.
	 * Another tab may have written since, and a stale account of the store is
	 * worse than no account of it.
	 */
	const [store, setStore] = useState<storage.Inventory>({ boards: [], bytes: 0 });
	const [documentKey, setDocumentKey] = useState(0);

	/**
	 * Set by `load` alone, and read once by the key effect below.
	 *
	 * A rename and an Open both change the key this board is stored under, and
	 * they mean opposite things about the entry under the old key. A rename
	 * should move it: one board, one entry, under the name it now has. An Open
	 * must leave it exactly where it is — the board it belongs to still exists
	 * and the visitor has simply gone to another one. Nothing in the resulting
	 * title tells the two apart, so the gesture says which it was.
	 *
	 * Without this, opening the example or starting a new board renamed the
	 * previous one onto the new key and then overwrote it, so a board nobody had
	 * exported was gone from the store panel with no gesture that meant delete.
	 *
	 * ba-ddd-mapper's `renamed` ref, inverted. There the flag marks the rename,
	 * because only the title field can start one. Here a title typed into the
	 * source pane is a rename too, and there is no handler to hang a flag on —
	 * so the openings are what get flagged, and they all go through `load`.
	 */
	const justOpened = useRef(false);
	const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
	const [expanded, setExpanded] = useState<ReadonlySet<Id>>(new Set());
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
	/**
	 * Whether the assistant is on screen.
	 *
	 * A view preference like the legend, restored from the store below. It
	 * starts closed: the panel costs a third of the width and is useless without
	 * a key, so a visitor who has never opened it should not meet it.
	 */
	const [agent, setAgent] = useState(false);
	/**
	 * How wide the assistant is, as a percentage of the window. Dragged by the
	 * handle beside it, and remembered — the width somebody settled on is a
	 * property of how they work, not of the board they were reading.
	 */
	const [agentWidth, setAgentWidth] = useState(storage.AGENT_DEFAULT_WIDTH);
	/** What the page is showing right now, so the toggle can offer the opposite. */
	const [pageIsDark, setPageIsDark] = useState(false);
	const [dragging, setDragging] = useState<{ kind: CardKind | 'lane'; title: string } | null>(null);
	const stage = useRef<HTMLDivElement>(null);

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

	/* ---- opening and saving ------------------------------------------------ */

	/**
	 * Open a file: the text becomes the document, whatever state it is in.
	 *
	 * It no longer refuses a file that does not parse, and that is the change
	 * this whole rewrite makes possible. The old contract — "a failed import
	 * never touches the board" — existed because the board *was* the state and a
	 * half-parsed file could not become one. Now the file is the state: it opens
	 * in the pane with its problems listed beneath it, which is the only way
	 * anybody was ever going to fix it.
	 */
	const load = useCallback((text: string) => {
		// Whatever was here keeps its entry under its own name — see `justOpened`.
		justOpened.current = true;
		send({ action: { type: 'import', text }, text });
		setDocumentKey((n) => n + 1);
		setDirty(false);
	}, []);

	/**
	 * The file, exported exactly as it sits in the pane.
	 *
	 * No serialisation step. What you have been editing is what lands on disk —
	 * comments, blank lines, your own column alignment and all — which is the
	 * thing the old export could not promise.
	 */
	const exportFile = useCallback(() => {
		downloadText(filenameFor(board.product, board.title), source);
		setDirty(false);
	}, [board.product, board.title, source]);

	/* ---- the browser's copy ------------------------------------------------ */

	const key = storageKeyOf(board);

	/**
	 * The text the store is known to hold.
	 *
	 * What autosave compares against, and the reason it no longer keys off
	 * `dirty`. `dirty` means "there are changes you have not *exported*" — it
	 * says so on the toolbar — which is a different question from "does the
	 * browser's copy match what is on screen". Keying the background save off it
	 * meant an imported file that nobody then edited was never written at all:
	 * `load` clears `dirty`, so there was nothing to trigger a save. That hole
	 * was survivable while a Save button existed to cover it.
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

	/** Follow a rename, so one board keeps one entry. See doc-em for the argument. */
	const previousKey = useRef<string | null>(null);
	useEffect(() => {
		const was = previousKey.current;
		previousKey.current = key;
		const opened = justOpened.current;
		justOpened.current = false;
		if (was !== null && was !== key && !opened) storage.rename(was, key);
		// `documentKey` is a dependency so that an Open landing on the *same* key
		// still clears the flag. Without it the flag would survive that open and
		// swallow the next real rename.
	}, [key, documentKey]);

	/**
	 * The background save: the only save there is.
	 *
	 * ba-ddd-mapper's model, and the Save button is gone with it. A button that
	 * has to be pressed to keep your work is a button somebody will not press,
	 * and it was never the thing that made the work safe — the file you export
	 * is. What the browser's copy is for is surviving a closed tab, and that is a
	 * job for the tool rather than for the visitor.
	 *
	 * Compared against the text last written rather than against a flag, so
	 * anything that changes the document is covered: typing in the pane, a drag
	 * on the wall, an imported file, the example.
	 */
	useEffect(() => {
		// A board nobody has written anything on yet is not work to be preserved,
		// and saving it would put an "Untitled event storm" in the store panel of
		// everybody who ever opened the page. The mapper's `blank(source)` guard.
		if (source === EMPTY_SOURCE || source === savedText.current) return;
		const timer = setTimeout(() => persist(board, source), AUTOSAVE_DELAY_MS);
		return () => clearTimeout(timer);
	}, [board, source, persist]);

	/**
	 * Write now, rather than at the end of the debounce.
	 *
	 * Called whenever this component is about to stop being the only thing that
	 * knows the current text — the tab closing, or the store panel opening
	 * another board over this one. A line typed a moment ago should be there when
	 * the next thing looks.
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
	 * Reformat the source: indentation only, nothing moves.
	 *
	 * Through `edit` rather than around it, so it lands on the undo stack like
	 * any other change to the text — a reformat you cannot take back is a poor
	 * thing to offer on a file somebody has laid out by hand.
	 *
	 * Refused when the text does not lex. `format` returns null there, and the
	 * reason is in its own header: an unterminated string would have every line
	 * after it re-indented as that string's continuation.
	 */
	const reformat = useCallback(() => {
		const tidied = formatSource(source);
		if (tidied !== null && tidied !== source) edit(tidied);
	}, [source]);

	/**
	 * A wall that did not exist a second ago.
	 *
	 * **Nothing is lost by pressing it.** The current one is written to this
	 * browser first — `flush`, rather than trusting the debounce — and the new
	 * one takes a name nothing is using, so pressing it twice leaves two drafts
	 * rather than one overwritten. Both are in the store panel.
	 *
	 * ba-ddd-mapper's button, and its rule.
	 */
	const startFresh = useCallback(() => {
		flush();
		const taken = new Set(storage.inventory().boards.map((entry) => entry.title));
		let title = 'New wall';
		for (let n = 2; taken.has(title); n += 1) title = `New wall ${n}`;
		// Say where the wall that was here went. It is still in the store under
		// its own name — the comment above has always claimed as much, and this
		// is the mapper's note that actually says it.
		const had = board.laneOrder.length > 0 && board.title !== '';
		const left = board.title;
		load(freshSource(title));
		if (had) {
			setNote({
				kind: 'warn',
				text: `Started “${title}”. “${left}” is still in this browser — the store panel opens it again.`,
			});
		}
	}, [board.laneOrder.length, board.title, flush, load]);

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
		if (!dirty) return;
		const guard = (event: BeforeUnloadEvent) => event.preventDefault();
		window.addEventListener('beforeunload', guard);
		return () => window.removeEventListener('beforeunload', guard);
	}, [dirty]);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (!(event.metaKey || event.ctrlKey)) return;
			const target = event.target as HTMLElement | null;
			if (target?.closest('input, textarea, [contenteditable="true"]')) return;
			const pressed = event.key.toLowerCase();
			if (pressed === 'z' && !event.shiftKey) {
				event.preventDefault();
				send({ type: 'undo' });
			} else if ((pressed === 'z' && event.shiftKey) || pressed === 'y') {
				event.preventDefault();
				send({ type: 'redo' });
			}
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, []);

	/* ---- detail, zoom, fullscreen ------------------------------------------ */

	/**
	 * No wall up yet — so offer the choice rather than a grid of empty squares.
	 *
	 * Lanes alone decide it. A storm with a lane and no cards is one somebody has
	 * started, and replacing it with a prompt would throw away the only decision
	 * on it.
	 */
	const empty = board.laneOrder.length === 0;

	const detailed = useMemo(() => cardsWithDetail(board), [board]);
	const anyExpanded = detailed.some((id) => expanded.has(id));

	const toggleDetail = useCallback((id: Id) => {
		setExpanded((was) => {
			const next = new Set(was);
			if (!next.delete(id)) next.add(id);
			return next;
		});
	}, []);

	const zoom = ZOOM_STOPS[zoomIndex] ?? 1;

	useEffect(() => {
		const sync = () => setFullscreen(document.fullscreenElement === stage.current);
		document.addEventListener('fullscreenchange', sync);
		return () => document.removeEventListener('fullscreenchange', sync);
	}, []);

	useEffect(() => setBoardTheme(storage.loadTheme()), []);
	useEffect(() => setLegend(storage.loadLegend()), []);
	useEffect(() => {
		const stored = storage.loadAgent();
		if (stored !== null) setAgent(stored);
	}, []);
	useEffect(() => setAgentWidth(storage.loadAgentWidth()), []);
	useEffect(() => setPanes(storage.loadPanes()), []);
	useEffect(() => setSplit(storage.loadSplit()), []);
	useEffect(() => setTextSize(storage.loadEditorText()), []);

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
		const request =
			element.requestFullscreen ??
			(element as unknown as { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen;
		void request?.call(element)?.catch?.(() => undefined);
	}, []);

	/* ---- drag and drop ----------------------------------------------------- */

	const sensors = useSensors(
		// 6px before a drag begins: a card is also the click target that opens its
		// editor, and without a threshold every click starts a drag.
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
	);

	const collisionDetection: CollisionDetection = useCallback((args) => {
		const type = args.active.data.current?.type;
		const containers = args.droppableContainers.filter((container) => {
			const data = container.data.current;
			// A lane reorders among lanes and against nothing else. Without this a
			// lane dragged down would collide with the squares beside it, of which
			// there are a great many and every one is a larger target.
			if (type === 'lane') return data?.type === 'lane';
			return data?.accepts === type || data?.type === type;
		});
		return closestCenter({ ...args, droppableContainers: containers });
	}, []);

	const onDragStart = useCallback(
		(event: DragStartEvent) => {
			const type = event.active.data.current?.type as 'card' | 'lane' | undefined;
			const id = String(event.active.id);
			if (type === 'lane') {
				const lane = board.lanes[id];
				setDragging(lane ? { kind: 'lane', title: lane.title } : null);
				return;
			}
			const card = type === 'card' ? board.cards[id] : undefined;
			setDragging(card ? { kind: card.kind, title: card.title } : null);
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

			if (activeData?.type === 'lane') {
				const index = board.laneOrder.indexOf(overId);
				if (index !== -1) dispatch({ type: 'moveLane', id: activeId, index });
				return;
			}

			if (activeData?.type === 'card') {
				// The drop is either on a square (its own `cell` datum) or on another
				// note, whose datum names the square it is on. Both resolve to a cell
				// key, which is the only thing the reducer needs — lane and column are
				// both encoded in it, so a sideways, vertical or diagonal drag is the
				// same call.
				const from = String(activeData.cell);
				const to = String(overData?.cell ?? from);
				const target = board.cells[to] ?? [];
				const index = target.indexOf(overId);
				dispatch({
					type: 'moveCard',
					cardId: activeId,
					from,
					to,
					index: index === -1 ? target.length : index,
				});
			}
		},
		[board, dispatch],
	);

	const announcements: Announcements = useMemo(
		() => ({
			onDragStart: ({ active }) => `Picked up ${nameOf(board, String(active.id))}.`,
			onDragOver: ({ active, over }) =>
				over ? `${nameOf(board, String(active.id))} is over ${nameOf(board, String(over.id))}.` : undefined,
			onDragEnd: ({ active, over }) =>
				over
					? `${nameOf(board, String(active.id))} was dropped on ${nameOf(board, String(over.id))}.`
					: `${nameOf(board, String(active.id))} was dropped.`,
			onDragCancel: ({ active }) => `Moving ${nameOf(board, String(active.id))} was cancelled.`,
		}),
		[board],
	);

	return (
		/*
		 * The stage follows the page. The daylight switch is on the board pane
		 * alone — see the `data-theme` further down.
		 *
		 * It used to be here, so that the toolbar, the legend and the dialogs came
		 * with it: they are part of the board, and the argument was that a light
		 * board under a dark toolbar would look like a rendering fault. What that
		 * missed is the source pane, which was under it too. Pinning the board to
		 * daylight to read it in a lit room turned the editor white as well —
		 * and the editor is not the board. It is a page of text somebody is in the
		 * middle of writing, its colours are the one thing on screen that should
		 * hold still, and ba-cm's mapper has never moved them: there the override
		 * sits on the map panel and nothing else.
		 *
		 * `bg-white text-ink dark:bg-night dark:text-slate-100` stays here, still
		 * not decoration. It is the page's own pair, and it is what the source
		 * pane and the toolbar now inherit while the board goes its own way.
		 */
		<div
			ref={stage}
			className={`flex flex-col gap-4 bg-white text-ink dark:bg-night dark:text-slate-100 ${
				fullscreen
					? 'h-screen overflow-hidden p-4'
					: /*
					   * A height, which this board never needed before: a pane that
					   * scrolls its own contents has to be told how tall it is, and
					   * "as tall as the page" is not a number. ba-ddd-mapper's frame.
					   *
					   * `overflow-hidden` with it, and not as a belt-and-braces: a
					   * fixed height whose contents are free to be taller is a box
					   * that spills, and what it spills onto is the page footer. The
					   * grid inside now fills this height rather than guessing at one
					   * — see BoardGrid — and this makes that structural rather than
					   * a thing the next component to be added has to remember.
					   */
						'h-[calc(100vh-15rem)] min-h-[34rem] overflow-hidden'
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
				saveState={stored}
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
				onFormat={reformat}
				onNew={startFresh}
				onExport={exportFile}
				onOpenStore={() => {
					setStore(storage.inventory());
					setOpening(true);
				}}
				onLoadSample={() => load(SAMPLE_SOURCE)}
				onAddLane={() => dispatch({ type: 'addLane', index: board.laneOrder.length })}
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
				panes={panes}
				onPanes={(next) => {
					setPanes(next);
					storage.savePanes(next);
				}}
				legendShown={legend}
				onToggleLegend={() => {
					setLegend(!legend);
					storage.saveLegend(!legend);
				}}
				agentShown={agent}
				onToggleAgent={() => {
					setAgent(!agent);
					storage.saveAgent(!agent);
				}}
				detailShown={anyExpanded}
				canToggleDetail={detailed.length > 0}
				onToggleAllDetail={() =>
					setExpanded(anyExpanded ? new Set() : new Set(detailed))
				}
			/>

			{/* Not gated the way doc-sm's and doc-em's are: the level picker lives in
			    here and is a control, not notation. The toggle hides the colours it
			    explains and leaves the choice of workshop on screen. */}
			<Legend
				board={board}
				shown={legend}
				onLevel={(level) => dispatch({ type: 'setLevel', level })}
			/>

			{note && (
				<p
					role="alert"
					className={
						note.kind === 'error'
							? 'flex items-start gap-2 border-b border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200'
							: 'flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200'
					}
				>
					<span className="grow">{note.text}</span>
					<button
						type="button"
						onClick={() => setNote(null)}
						aria-label="Dismiss"
						className="shrink-0 font-semibold"
					>
						✕
					</button>
				</p>
			)}

			<div className="flex min-h-0 flex-1 flex-col lg:flex-row">
				{/* The source first in the DOM and first when stacked: on a narrow
				    viewport this is a thing you read, and the text is the storm. */}
				{panes !== 'board' && (
					<section
						aria-label="Source"
						className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-300 dark:border-slate-700 ${
							panes === 'both' ? '' : 'flex-1'
						}`}
						/* The split is a proportion between two panes and means nothing
						   to one, which grows instead — and the stored percentage is
						   left alone, so coming back to two restores the proportions. */
						style={panes === 'both' ? { flexBasis: `${split}%` } : undefined}
					>
						<div className="min-h-0 flex-1 overflow-auto">
							<Editor
								value={source}
								onChange={edit}
								problems={problems}
								revealLine={revealLine}
								highlight={highlight}
								textSize={textSize}
							/>
						</div>
						<SourceProblems
							problems={problems}
							stale={stale}
							collapsed={problemsCollapsed}
							onToggle={() => setProblemsCollapsed((was) => !was)}
							onReveal={(line) => setRevealLine(line)}
							textSize={textSize}
							onTextSize={(px) => {
								setTextSize(px);
								storage.saveEditorText(px);
							}}
						/>
					</section>
				)}

				{panes === 'both' && (
					<Divider
						percent={split}
						onMove={(percent) => {
							setSplit(percent);
							storage.saveSplit(percent);
						}}
					/>
				)}

				{panes !== 'source' && (
					/*
					 * `min-w-0`, and it is load-bearing.
					 *
					 * A flex item's `min-width` defaults to `auto`, which means it will
					 * not shrink below the minimum width of its contents. The wall's
					 * grid is `min-w-max` — it has to be, it is a row of fixed-width
					 * squares — so this section asked for the whole grid's width and got
					 * it, squeezing the source pane next to it down to nothing. Both
					 * panes were showing; one of them was zero pixels wide.
					 *
					 * ba-ddd-mapper never had to write this: its graph is an SVG that
					 * scales to whatever it is given, so it has no minimum to insist on.
					 */
										/*
					 * `data-theme` is the whole override, and it stops here.
					 *
					 * `dark:` resolves against the nearest ancestor that carries it —
					 * see the `@custom-variant` in global.css — so everything under
					 * this section follows the board's theme without knowing that a
					 * board theme exists, and everything outside it, the source pane
					 * above all, carries on following the page. Absent while the board
					 * follows the page too.
					 *
					 * ## The section must state its own colours, not inherit them
					 *
					 * `bg-white text-ink dark:bg-night dark:text-slate-100` is not
					 * decoration — it is what makes the override sound.
					 *
					 * Anything inside that does not set a colour inherits one, and the
					 * nearest would otherwise be the stage's, which resolves where
					 * there is no `data-theme` and so follows the operating system.
					 * Pin the board to daylight on a machine in dark mode and its own
					 * surfaces correctly turn white while every unstyled string inside
					 * them stays near-white. The swimlane names go first, being the
					 * largest text on the board carrying no colour class of its own.
					 *
					 * Restating the pair stops the inheritance at the boundary: the
					 * subtree takes its foreground and background from the same
					 * attribute that decides its variants. The values are the page's,
					 * so a board that is *not* pinned looks exactly as it did.
					 */
					<section
						aria-label="The wall"
						data-theme={boardTheme ?? undefined}
						className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 bg-white text-ink dark:bg-night dark:text-slate-100"
					>
			<DndContext
				sensors={sensors}
				collisionDetection={collisionDetection}
				accessibility={{ announcements }}
				onDragStart={onDragStart}
				onDragEnd={onDragEnd}
				onDragCancel={() => setDragging(null)}
			>
				{empty ? (
					<EmptyBoard
						onLoadSample={() => load(SAMPLE_SOURCE)}
						onAddLane={() => dispatch({ type: 'addLane', index: 0 })}
					/>
				) : (
				<BoardGrid
					board={board}
					dispatch={dispatch}
					zoom={zoom}
					fullscreen={fullscreen}
					documentKey={documentKey}
					expanded={expanded}
					onToggleDetail={toggleDetail}
					selected={selected}
					onSelect={setSelected}
				/>
				)}

				{/* Mandatory, not decorative: the board scrolls, and a card dragged
				    by transform inside an overflow:auto container is clipped at its
				    edge. */}
				<DragOverlay dropAnimation={null}>
					{dragging && (
						<div
							style={{ fontSize: `${BASE_FONT * zoom}px` }}
							className={`rounded-[0.3em] border px-[0.4em] py-[0.3em] text-[0.75em] shadow-lg ${
								// A lane is a line somebody drew, not a sticky note, so it
								// drags as a plain opaque label — which is also how it looks
								// at rest in the rail.
								dragging.kind === 'lane'
									? 'border-slate-300 bg-white font-semibold dark:border-slate-600 dark:bg-night-raised'
									: cardClass[dragging.kind]
							}`}
						>
							{dragging.title}
						</div>
					)}
				</DragOverlay>
			</DndContext>
					</section>
				)}

				{/* A third column, after the board rather than over it: an answer
				    about a wall is read *beside* the wall, and a panel that covered
				    the thing it is discussing would be the wrong shape.
				    ba-ddd-mapper puts its assistant in the same place. */}
				{agent && (
					<>
						<Divider
							percent={agentWidth}
							from="right"
							min={storage.AGENT_MIN}
							max={storage.AGENT_MAX}
							label="Resize the assistant"
							onMove={(percent) => {
								setAgentWidth(percent);
								storage.saveAgentWidth(percent);
							}}
						/>
						<AgentPanel
							source={source}
							promptsUrl={promptsUrl}
							check={problemsIn}
							width={agentWidth}
							onApply={edit}
							onClose={() => {
								setAgent(false);
								storage.saveAgent(false);
							}}
						/>
					</>
				)}
			</div>

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
					// Re-read rather than splice the row out of the list: if the delete
					// did not take — a store that throws is why every call here is
					// wrapped — the row is still there, which is the truth.
					setStore(storage.inventory());
				}}
				onClose={() => setOpening(false)}
			/>
		</div>
	);
}

/**
 * The problems in a candidate document, without disturbing the board.
 *
 * The assistant's proposal has to be parsed before it is offered, and the
 * board's own `parsed` memo is about the text on screen. Same parser, same
 * errors, no state: a proposal that does not parse is shown with its errors and
 * cannot be applied.
 */
function problemsIn(text: string): readonly Problem[] {
	try {
		parse(text);
		return [];
	} catch (error) {
		if (!(error instanceof EventStormParseError)) throw error;
		return error.problems;
	}
}

/** Where this board belongs in storage. One derivation, three callers. */
function storageKeyOf(board: BoardState): string {
	return storage.storageKey(board.product, board.title);
}

function nameOf(board: BoardState, id: string): string {
	const card = board.cards[id];
	if (card) return `${cardLabel[card.kind]} ${card.title}`;
	const lane = board.lanes[id];
	if (lane) return `lane ${lane.title}`;
	return 'the note';
}

/**
 * What an unopened board offers instead of a grid.
 *
 * doc-sm's prompt, with doc-es's verbs. The board used to open with one unnamed
 * lane so the first square had somewhere to be — a good argument about the grid
 * and a bad one about the tool. An empty board is opened far more often to import
 * a file or look at the example than to start a workshop, and a lane nobody asked
 * for is furniture to clear away.
 */
function EmptyBoard({ onLoadSample, onAddLane }: { onLoadSample: () => void; onAddLane: () => void }) {
	return (
		<div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-600">
			<h2 className="text-lg font-semibold">No storm open</h2>
			<p className="mx-auto mt-2 max-w-prose text-ink-muted dark:text-slate-400">
				Import an <code>.eventstorm</code> file, start from the example, or put up the wall and start
				writing. Nothing is stored on the server — the file you export is the wall.
			</p>
			<div className="mt-5 flex flex-wrap justify-center gap-3">
				<button
					type="button"
					onClick={onLoadSample}
					className="rounded-full border border-slate-300 px-5 py-2.5 font-semibold transition hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand motion-reduce:transition-none dark:border-slate-600 dark:hover:border-sky-400 dark:hover:text-sky-400"
				>
					Load the example
				</button>
				<button
					type="button"
					onClick={onAddLane}
					autoFocus
					className="rounded-full bg-brand px-5 py-2.5 font-semibold text-white transition hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand motion-reduce:transition-none"
				>
					Put up the wall
				</button>
			</div>
		</div>
	);
}
