/**
 * The board island — doc-em's one hydrated component.
 *
 * The same shape as doc-sm's, for the same reason: a board is edited by direct
 * manipulation, and there is no URL or form that expresses "this question is
 * really about the story, not about that rule". Every other page in doc-em is
 * server-rendered HTML with no script attached.
 *
 * Drag policy is doc-sm's too — state is untouched until `onDragEnd`, which
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
import {
	deliveryPositionOf,
	examplePositionOf,
	questionPositionOf,
	rulePositionOf,
	toBoard,
} from '../../lib/board/convert.ts';
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
import { resetsHistory, type BoardAction, type QuestionParent } from '../../lib/board/gestures.ts';
import { cardsWithDetail, filtered, tagsInUse, type BoardState, type Id } from '../../lib/board/state.ts';
import { featureFilename, toGherkin, unwritableQuestions } from '../../lib/examplemap/gherkin.ts';
import { cardLabel, deliveryKindLabel, type CardKind } from '../../lib/examplemap/model.ts';
import { parse } from '../../lib/examplemap/parser.ts';
import type { ExampleMapDocument } from '../../lib/examplemap/model.ts';
import { ExampleMapParseError, type Problem } from '../../lib/examplemap/problems.ts';
import { EMPTY_SOURCE, freshSource, SAMPLE_SOURCE } from '../../lib/examplemap/sample.ts';
import type { Product } from '../../lib/products.ts';
import { BASE_FONT, BoardGrid } from './BoardGrid.tsx';
import { StoreState } from './StoreState.tsx';
import { Divider } from './Divider.tsx';
import { DEFAULT_TEXT_SIZE, Editor } from './Editor.tsx';
import { GherkinDialog } from './GherkinDialog.tsx';
import { SourceProblems } from './SourceProblems.tsx';
import { Legend } from './Legend.tsx';
import { TagFilter } from './TagFilter.tsx';
import { Readings } from './Readings.tsx';
import { Toolbar } from './Toolbar.tsx';

const HISTORY_LIMIT = 100;
/** How long the board must be still before autosave writes. See the effect. */
const AUTOSAVE_DELAY_MS = 1_000;
const ZOOM_STOPS = [1, 1.15, 1.3, 1.45, 1.6] as const;
const DEFAULT_ZOOM_INDEX = 0;

/**
 * One entry in the undo stack: what the visitor did, and the file it produced.
 *
 * The gesture travels alongside the text because history still needs to know
 * *which* gesture it was — an import clears the stack, an edit does not. The
 * fold is a replace: the splice has already happened by the time a commit gets
 * here.
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

export default function ExampleMapBoard({
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
	 * History holds *source strings* rather than board states: a step back is the
	 * file as it was, so undo takes back a drag and a typed line in exactly the
	 * same way. `History<T>` was already generic.
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
	 * The board keeps drawing the last good document while the text is broken,
	 * which is what lets somebody type a half-finished line without the map
	 * disappearing underneath them — and the problems panel says the board is
	 * behind, so the state is never a silent lie.
	 */
	const parsed = useMemo(() => {
		try {
			return { document: parse(source), problems: [] as readonly Problem[] };
		} catch (error) {
			if (!(error instanceof ExampleMapParseError)) throw error;
			return { document: null, problems: error.problems };
		}
	}, [source]);

	const lastGood = useRef<ExampleMapDocument | null>(null);
	if (parsed.document !== null) lastGood.current = parsed.document;

	const document_ = parsed.document ?? lastGood.current;
	const problems = parsed.problems;
	const stale = parsed.document === null && lastGood.current !== null;

	/**
	 * The board, projected from the parsed document.
	 *
	 * Rebuilt on every parse, which is affordable because ids are positional —
	 * see `convert.ts`. A card nobody moved keeps its id across the rebuild, so
	 * React keeps its element and dnd-kit keeps its drag while somebody types in
	 * the pane beside it.
	 */
	const board = useMemo(() => toBoard(document_ ?? EMPTY_DOCUMENT), [document_]);

	/**
	 * The feature file, regenerated from the text.
	 *
	 * Null while the map does not parse — there is nothing to write one from, and
	 * the tab says so rather than showing a stale render.
	 */
	const gherkin = useMemo(
		() => (parsed.document === null ? null : toGherkin(parsed.document)),
		[parsed.document],
	);

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
	/**
	 * The card whose text the source pane is emphasising.
	 *
	 * A kind and an id rather than a span: the span is a fact about the *current*
	 * parse and this outlives several of them, and positional ids mean the id
	 * still names the same card as long as nothing above it moved.
	 */
	const [selected, setSelected] = useState<{ kind: CardKind | 'delivery'; id: Id } | null>(null);

	/**
	 * Where the selected card is written, for the source pane to emphasise.
	 *
	 * The whole declaration — title, annotations, steps, notes — because what is
	 * selected is the card and the card is all of it. Null when nothing is
	 * selected, when the text no longer parses, or when the id names a card that
	 * is no longer there.
	 */
	const highlight = useMemo(() => {
		const d = parsed.document;
		if (selected === null || d === null) return null;
		if (selected.kind === 'delivery') {
			const at = deliveryPositionOf(selected.id);
			return at === null ? null : (d.deliveries[at]?.spans.span ?? null);
		}
		if (selected.kind === 'story') return d.story?.spans.span ?? null;
		if (selected.kind === 'rule') {
			const at = rulePositionOf(selected.id);
			return at === null ? null : (d.rules[at]?.spans.span ?? null);
		}
		if (selected.kind === 'example') {
			const at = examplePositionOf(selected.id);
			return at === null ? null : (d.rules[at.rule]?.examples[at.example]?.spans.span ?? null);
		}
		const at = questionPositionOf(selected.id);
		if (at === null) return null;
		const node =
			at.rule === 'story' ? d.story?.questions[at.question] : d.rules[at.rule]?.questions[at.question];
		return node?.spans.span ?? null;
	}, [selected, parsed.document]);
	const [problemsCollapsed, setProblemsCollapsed] = useState(false);

	const [dirty, setDirty] = useState(false);
	/** What the browser's copy last said, or why it could not be written. */
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
	/**
	 * The saved list, read when the dialog opens rather than on every render.
	 *
	 * `saved()` walks every key at this origin, which is cheap but not free, and
	 * nothing on the board changes it except this component — so it is refreshed
	 * where it can change: opening the dialog, and deleting from it.
	 */
	/* Read when the panel opens: another tab may have written since. */
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
	const [expanded, setExpanded] = useState<ReadonlySet<Id>>(() => new Set());
	/**
	 * Which tags the map is pointing at, by `tagKey`. Empty is the filter off.
	 *
	 * View state, like `expanded` above it, and deliberately **not** stored: a
	 * filter is a question somebody is asking right now, not a property of the
	 * board. Coming back tomorrow to a map with two thirds of it greyed out, and
	 * no memory of having asked, is the failure mode a remembered filter has —
	 * where a remembered zoom or legend is just where you left things.
	 *
	 * Keys rather than spellings, so a map carrying `+Legal` on one card and
	 * `+legal` on another filters to both from one chip.
	 */
	const [tagFilter, setTagFilter] = useState<ReadonlySet<string>>(() => new Set());
	/**
	 * What is currently under the cursor, for the drag overlay.
	 *
	 * `kind` is a card kind, or `delivery` for a band being reordered — the
	 * overlay paints a card in its own colour, and a band has no card colour
	 * because it is not a card.
	 */
	const [dragging, setDragging] = useState<{ kind: CardKind | 'delivery'; title: string } | null>(null);
	const stage = useRef<HTMLDivElement>(null);

	/**
	 * A gesture from the grid, carried out on the text.
	 *
	 * The action shapes are unchanged, which is why nothing below the toolbar had
	 * to be rewritten — see `apply.ts`. A gesture against a document that does
	 * not currently parse is dropped: the spans it would splice describe text
	 * that has since been edited by hand.
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
	 * It no longer refuses a file that does not parse. The old contract — "a
	 * failed import never touches the board" — existed because the board *was*
	 * the state. Now the file is the state: it opens in the pane with its
	 * problems listed beneath it, which is the only way anybody was going to fix
	 * it.
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
	 * No serialisation step: what you have been editing is what lands on disk,
	 * comments and all.
	 */
	const exportFile = useCallback(() => {
		downloadText(filenameFor(board.product, board.title), source);
		setDirty(false);
	}, [board.product, board.title, source]);

	/**
	 * Write the feature file.
	 *
	 * Deliberately does *not* clear the dirty flag. The Gherkin is what the map
	 * produced, not the map: a session that has written its feature file has
	 * still not saved its red cards, and telling them otherwise would lose the
	 * half of the board the practice says matters most.
	 */
	/**
	 * Show the feature file, rather than write it.
	 *
	 * It used to download on the first click, behind a `confirm()` when questions
	 * were open. A file that lands in your downloads folder unseen is a poor way
	 * to learn what it says — and the warning about open questions was a modal
	 * asking you to accept something you had not read yet. The screen shows the
	 * file, states the count, and offers Copy and Save.
	 */
	const [previewingGherkin, setPreviewingGherkin] = useState(false);


	/* ---- the browser's copy ------------------------------------------------ */

	const key = storageKeyOf(board);

	/**
	 * Write the board to this browser, now.
	 *
	 * Also what the Save button calls. Autosave below is this on a timer; there
	 * is deliberately no second code path, because "the save button saved
	 * something slightly different from the autosave" is a bug nobody would ever
	 * think to look for.
	 */
	/**
	 * The text the store is known to hold.
	 *
	 * What autosave compares against, and the reason it does not key off `dirty`.
	 * `dirty` means "changes you have not *exported*", which is a different
	 * question from "does the browser's copy match the screen".
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
		const opened = justOpened.current;
		justOpened.current = false;
		if (was !== null && was !== key && !opened) storage.rename(was, key);
		// `documentKey` is a dependency so that an Open landing on the *same* key
		// still clears the flag. Without it the flag would survive that open and
		// swallow the next real rename.
	}, [key, documentKey]);

	/**
	 * Autosave, a second after the last change.
	 *
	 * Debounced rather than written on every action: dragging a card fires one
	 * action, but typing a title fires one per keystroke, and serialising the
	 * whole map on each of them would be work nobody asked for.
	 *
	 * One second is short enough that the answer to "did I lose it?" is no, and
	 * long enough that a burst of typing writes once. The timer is cleared on
	 * every change, so the write happens when the room stops moving.
	 *
	 * Skipped while the board is untouched. A visitor who opens doc-em, looks
	 * around and leaves should not find an "untitled" board saved in their
	 * browser afterwards — an empty board is not work, and autosave is for work.
	 */
	useEffect(() => {
		// An untouched empty board is not work to be preserved, and saving it would
		// put an "Untitled example map" in everybody's store panel.
		if (source === EMPTY_SOURCE || source === savedText.current) return;
		const timer = setTimeout(() => persist(board, source), AUTOSAVE_DELAY_MS);
		return () => clearTimeout(timer);
	}, [board, source, persist]);

	/**
	 * Write now, rather than at the end of the debounce.
	 *
	 * Called whenever this component is about to stop being the only thing that
	 * knows the current text — the tab closing, or the store panel opening
	 * another map over this one.
	 */
	const flush = useCallback(() => {
		if (source === EMPTY_SOURCE || source === savedText.current) return;
		persist(board, source);
	}, [board, source, persist]);

	// Registered once and read through a ref, so the listener is not torn down on
	// every keystroke.
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
	 * A map that did not exist a second ago.
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
		let title = 'New map';
		for (let n = 2; taken.has(title); n += 1) title = `New map ${n}`;
		// Say where the map that was here went. It is still in the store under its
		// own name — the comment above has always claimed as much, and this is the
		// mapper's note that actually says it.
		const had = (board.story !== null || board.ruleOrder.length > 0) && board.title !== '';
		const left = board.title;
		load(freshSource(title));
		if (had) {
			setNote({
				kind: 'warn',
				text: `Started “${title}”. “${left}” is still in this browser — the store panel opens it again.`,
			});
		}
	}, [board.story, board.ruleOrder.length, board.title, flush, load]);

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
		// It came *from* the store, so the store already holds it.
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

	/* ---- detail, zoom, fullscreen ------------------------------------------ */

	/**
	 * Nothing named and nothing written — so offer the choice rather than a grid.
	 *
	 * Deliveries do not count. A storm-in-waiting with a timeline drawn on it is a
	 * board somebody has already started, and replacing it with a prompt would
	 * throw away the only thing on it.
	 */
	const empty = board.story === null && board.ruleOrder.length === 0;

	const detailed = useMemo(() => cardsWithDetail(board), [board]);
	const anyExpanded = detailed.some((id) => expanded.has(id));

	const toggleDetail = useCallback((id: Id) => {
		setExpanded((was) => {
			const next = new Set(was);
			if (!next.delete(id)) next.add(id);
			return next;
		});
	}, []);

	const tags = useMemo(() => tagsInUse(board), [board]);
	const matching = useMemo(() => filtered(board, tagFilter), [board, tagFilter]);

	const toggleTag = useCallback((key: string) => {
		setTagFilter((was) => {
			const next = new Set(was);
			if (!next.delete(key)) next.add(key);
			return next;
		});
	}, []);

	/*
	 * A tag that is no longer on any card stops being a filter.
	 *
	 * Otherwise deleting the last `+legal` rule, or renaming that tag in the
	 * source pane, leaves the map filtered by something nothing wears — every
	 * card dimmed, and no chip left on the row to press to undo it. The board
	 * would look broken, and the only way out would be a reload.
	 */
	useEffect(() => {
		const live = new Set(tags.map((entry) => entry.key));
		setTagFilter((was) => {
			const next = new Set([...was].filter((key) => live.has(key)));
			return next.size === was.size ? was : next;
		});
	}, [tags]);

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
			// A rule reorders among rules and a band among bands: both are sortable
			// against their own kind and against nothing else. Without this a rule
			// being dragged sideways would happily collide with the cells beneath
			// it, which are much larger targets.
			if (type === 'rule') return data?.type === 'rule';
			if (type === 'delivery') return data?.type === 'delivery';
			return data?.accepts === type || data?.type === type;
		});
		return closestCenter({ ...args, droppableContainers: containers });
	}, []);

	const onDragStart = useCallback(
		(event: DragStartEvent) => {
			const type = event.active.data.current?.type as CardKind | 'delivery' | undefined;
			const id = String(event.active.id);
			const title =
				type === 'rule'
					? board.rules[id]?.title
					: type === 'example'
						? board.examples[id]?.title
						: type === 'delivery'
							? board.deliveries[id]?.title
							: board.questions[id]?.title;
			setDragging(type === undefined || title === undefined ? null : { kind: type, title });
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

			if (activeData?.type === 'rule') {
				const index = board.ruleOrder.indexOf(overId);
				if (index !== -1) dispatch({ type: 'moveRule', ruleId: activeId, index });
				return;
			}

			if (activeData?.type === 'delivery') {
				const index = board.deliveryOrder.indexOf(overId);
				if (index !== -1) dispatch({ type: 'moveDelivery', id: activeId, index });
				return;
			}

			if (activeData?.type === 'example') {
				// The drop is either on a cell (its own `cell` datum) or on another
				// example, whose datum names the cell it is in. Both resolve to a
				// cell key, which is the only thing the reducer needs — rule and band
				// are both encoded in it, so a sideways, downward or diagonal drag is
				// the same call.
				const from = String(activeData.cell);
				const to = String(overData?.cell ?? from);
				const target = board.cells[to] ?? [];
				const index = target.indexOf(overId);
				dispatch({
					type: 'moveExample',
					exampleId: activeId,
					from,
					to,
					index: index === -1 ? target.length : index,
				});
				return;
			}

			if (activeData?.type === 'question') {
				const from = activeData.parent as QuestionParent;
				const to = (overData?.parent ?? overData?.parent) as QuestionParent | undefined;
				const parent = to ?? from;
				const target =
					'story' in parent ? (board.story?.questions ?? []) : (board.rules[parent.ruleId]?.questionIds ?? []);
				const index = target.indexOf(overId);
				dispatch({
					type: 'moveQuestion',
					questionId: activeId,
					from,
					to: parent,
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
				space={board.space}
				spacePlaceholder={board.product ?? ''}
				onSpace={(next) => dispatch({ type: 'setSpace', space: next })}
				dirty={dirty}
				canUndo={canUndo(history)}
				canRedo={canRedo(history)}
				onTitle={(title) => dispatch({ type: 'setMapTitle', title })}
				onPickFile={async (file, input) => {
					const text = await readTextFile(file);
					clearFileInput(input);
					load(text);
				}}
				onFormat={reformat}
				onNew={startFresh}
				onExport={exportFile}
				onExportGherkin={() => setPreviewingGherkin(true)}
				panes={panes}
				onPanes={(next) => {
					setPanes(next);
					storage.savePanes(next);
				}}
				onLoadSample={() => load(SAMPLE_SOURCE)}
				onOpenStore={() => {
					setStore(storage.inventory());
					setOpening(true);
				}}
				saveState={stored}
				onAddRule={() => dispatch({ type: 'addRule', index: board.ruleOrder.length })}
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
				agentShown={agent}
				onToggleAgent={() => {
					setAgent(!agent);
					storage.saveAgent(!agent);
				}}
				detailShown={anyExpanded}
				canToggleDetail={detailed.length > 0}
				onToggleAllDetail={() => setExpanded(anyExpanded ? new Set() : new Set(detailed))}
			/>

			{/* Not gated by the `legend` switch, whose list now sits below this
			    rather than above it. That switch hides reference text you may
			    already know; a filter you have turned on is state, not reference,
			    and hiding it would leave the map dimmed with nothing on screen
			    explaining why. */}
			<TagFilter
				tags={tags}
				chosen={tagFilter}
				onToggle={toggleTag}
				onClear={() => setTagFilter(new Set())}
				matching={matching?.size ?? 0}
				total={
					(board.story === null ? 0 : 1) +
					Object.keys(board.rules).length +
					Object.keys(board.examples).length +
					Object.keys(board.questions).length
				}
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

			{/*
			 * Last of the three, because it is the only one of them that is not
			 * about *this* map.
			 *
			 * The filter above says how the map is being read right now and the
			 * alert says what just happened to it — both are state, both change
			 * under the reader, and both are worth meeting before a list of what
			 * the colours mean. Reference text that sits above the state pushes
			 * the state down the page on every visit, including the visits where
			 * nobody needed the reference; putting it last costs the reader
			 * nothing on the day they do want it, and a screenful on the days
			 * they do not.
			 *
			 * doc-es orders its board the same way, for the same reason.
			 */}
			{legend && <Legend />}

			<GherkinDialog
				open={previewingGherkin}
				filename={parsed.document === null ? 'no feature file' : featureFilename(parsed.document)}
				text={gherkin}
				unwritable={parsed.document === null ? 0 : unwritableQuestions(parsed.document)}
				textSize={textSize}
				onClose={() => setPreviewingGherkin(false)}
			/>

			<StoreState
				open={opening}
				state={store}
				current={key}
				onOpen={(pick) => {
					// Before this map stops being the one on screen: there may be up to
					// a second of typing still sitting in the debounce.
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
					 * `min-w-0`, and it is load-bearing: a flex item will not shrink
					 * below its content's minimum width, and the grid is `min-w-max`.
					 * Without it this section demands the whole grid's width and the
					 * source pane beside it is squeezed to nothing.
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
						aria-label="The map"
						data-theme={boardTheme ?? undefined}
						className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 bg-white text-ink dark:bg-night dark:text-slate-100"
					>
			<Readings board={board} />

			<DndContext
				sensors={sensors}
				collisionDetection={collisionDetection}
				onDragStart={onDragStart}
				onDragEnd={onDragEnd}
				onDragCancel={() => setDragging(null)}
				accessibility={{ announcements }}
			>
				<div className={fullscreen ? 'flex min-h-0 flex-1 flex-col' : undefined}>
					{empty ? (
						<EmptyBoard
							onLoadSample={() => load(SAMPLE_SOURCE)}
							onAddStory={() => dispatch({ type: 'addStory' })}
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
						matching={matching}
					/>
					)}

					{/* Mandatory, not decorative: the board scrolls, and a card dragged
					    by transform inside an overflow:auto container is clipped at its
					    edge. */}
					<DragOverlay dropAnimation={null}>
						{dragging && (
							<div
								style={{ fontSize: `${BASE_FONT * zoom}px` }}
								className={`rounded-[0.4em] border px-[0.55em] py-[0.4em] text-[1em] shadow-lg ${
									// A band has no card colour, because it is not a card. It
									// drags as a plain opaque label, which is also how it looks
									// at rest in the rail.
									dragging.kind === 'delivery'
										? 'border-slate-300 bg-white font-semibold dark:border-slate-600 dark:bg-night-raised'
										: cardClass[dragging.kind]
								}`}
							>
								{dragging.title}
							</div>
						)}
					</DragOverlay>
				</div>
			</DndContext>
					</section>
				)}

				{/* A third column, after the board rather than over it: an answer
				    about a map is read *beside* the map, and a panel that covered
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
		if (!(error instanceof ExampleMapParseError)) throw error;
		return error.problems;
	}
}

/** Where this board belongs in storage. One derivation, three callers. */
function storageKeyOf(board: BoardState): string {
	return storage.storageKey(board.product, board.title);
}

function nameOf(board: BoardState, id: string): string {
	if (board.rules[id]) return `${cardLabel.rule} ${board.rules[id]!.title}`;
	if (board.examples[id]) return `${cardLabel.example} ${board.examples[id]!.title}`;
	if (board.questions[id]) return `${cardLabel.question} ${board.questions[id]!.title}`;
	// A band is not a card, and the announcement should not call it one.
	const delivery = board.deliveries[id];
	if (delivery) return `${deliveryKindLabel[delivery.kind]} ${delivery.title}`;
	return 'the card';
}

/**
 * What an unopened board offers instead of a placeholder.
 *
 * doc-sm's prompt, with doc-em's verbs. The board used to open with a story card
 * reading "To be defined", on the argument that a session which has not named its
 * story has not started. True of the session and false of the tool: an empty
 * board is opened far more often to import a file or look at the example than to
 * start a session, and the placeholder was then furniture to clear away.
 */
function EmptyBoard({ onLoadSample, onAddStory }: { onLoadSample: () => void; onAddStory: () => void }) {
	return (
		<div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-slate-600">
			<h2 className="text-lg font-semibold">No map open</h2>
			<p className="mx-auto mt-2 max-w-prose text-ink-muted dark:text-slate-400">
				Import an <code>.examplemap</code> file, start from the example, or name the story this session
				is about. Nothing is stored on the server — the file you export is the map.
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
					onClick={onAddStory}
					autoFocus
					className="rounded-full bg-brand px-5 py-2.5 font-semibold text-white transition hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand motion-reduce:transition-none"
				>
					Add a story
				</button>
			</div>
		</div>
	);
}
