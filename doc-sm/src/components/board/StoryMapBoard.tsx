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
import { applyText, resetIds, toBoard, toDocument } from '../../lib/board/convert.ts';
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
import { reduce, resetsHistory, type BoardAction } from '../../lib/board/reducer.ts';
import {
	bandOrder,
	emptyBoard,
	unboundStories,
	splitCellKey,
	storiesIn,
	UNASSIGNED,
	type BoardState,
	type Id,
} from '../../lib/board/state.ts';
import type { Product } from '../../lib/products.ts';
import { effectiveSpace, type StoryStatus } from '../../lib/storymap/model.ts';
import { parse } from '../../lib/storymap/parser.ts';
import { StoryMapParseError, type Problem } from '../../lib/storymap/problems.ts';
import { SAMPLE_SOURCE } from '../../lib/storymap/sample.ts';
import { serialize } from '../../lib/storymap/serialize.ts';
import { BoardGrid } from './BoardGrid.tsx';
import { PreviewDialog } from './PreviewDialog.tsx';
import { PublishDialog, type PublishProgress } from './PublishDialog.tsx';
import { ProblemList } from './ProblemList.tsx';
import { Toolbar } from './Toolbar.tsx';

/** How far back undo goes. Snapshots are cheap; see history.ts. */
const HISTORY_LIMIT = 100;

/**
 * Zoom stops, as multipliers of the board's base font size.
 *
 * A fixed ladder rather than a continuous slider: the useful question is "show
 * me more of the board" or "let me read this", and a handful of stops answers it
 * without anyone fiddling to find a round number. 0.6 fits roughly twice the
 * columns of 1.2 across the same screen.
 */
const ZOOM_STOPS = [0.6, 0.7, 0.85, 1, 1.15, 1.35, 1.6] as const;
const DEFAULT_ZOOM_INDEX = 3;

const step = undoable<BoardState, BoardAction>(reduce, {
	limit: HISTORY_LIMIT,
	resets: resetsHistory,
});

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
	const [history, send] = useReducer(
		step as (state: History<BoardState>, action: BoardAction | HistoryAction) => History<BoardState>,
		undefined,
		() => initialHistory(emptyBoard()),
	);
	const board = history.present;

	const [problems, setProblems] = useState<readonly Problem[]>([]);
	const [dragging, setDragging] = useState<{ id: Id; title: string; kind: 'activity' | 'step' | 'story' } | null>(null);
	// "Changed since the last import or export." The only state doc-sm can lose.
	const [dirty, setDirty] = useState(false);
	const [previewing, setPreviewing] = useState(false);
	const [ticketError, setTicketError] = useState<string | null>(null);
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
	const stage = useRef<HTMLDivElement>(null);
	const [progress, setProgress] = useState<PublishProgress | null>(null);

	const dispatch = useCallback((action: BoardAction) => {
		send(action);
		setDirty(true);
	}, []);

	/* ---- import and export ------------------------------------------------ */

	const load = useCallback((source: string) => {
		try {
			// Ids are per-document and never leave the tab, so restarting the
			// counter on each import keeps them short and keeps toBoard() a
			// deterministic function of the file.
			resetIds();
			const next = toBoard(parse(source));
			setProblems([]);
			send({ type: 'import', board: next });
			setDirty(false);
		} catch (error) {
			if (!(error instanceof StoryMapParseError)) throw error;
			// The board is untouched. That is the whole contract of a failed import.
			setProblems(error.problems);
		}
	}, []);

	/**
	 * The text the dialog opens with.
	 *
	 * Gated on the dialog being open so a large board is not re-serialised on
	 * every keystroke of every card edit. It is a snapshot and not a live view —
	 * the dialog is modal, so the board behind it cannot change while it is up,
	 * and the draft belongs to the visitor from the moment it opens.
	 */
	const preview = useMemo(
		() => (previewing ? serialize(toDocument(board)) : ''),
		[previewing, board],
	);

	/**
	 * Put edited preview text back onto the board.
	 *
	 * Two things separate this from importing a file, and both are deliberate.
	 *
	 * **The product is not taken from the text.** It is carried over from the
	 * board, which got it from the picker, which got it from the registry. A
	 * `.storymap` file on disk is entitled to name its own product — that is how
	 * the shortname travels — but text somebody just typed into a box is not
	 * validated against anything, and letting it win would put an unregistered or
	 * misspelled shortname into a file with nothing to catch it. So the line
	 * round-trips and is then ignored, which is what the dialog says it does.
	 *
	 * **It is undoable.** `applyText` rather than `import`, so the history
	 * survives — see the comment on the action in reducer.ts. Rewriting a board
	 * by hand is the largest single edit the tool offers, and it should be the
	 * easiest to take back.
	 */
	const applyPreview = useCallback(
		(source: string): readonly Problem[] => {
			let next;
			try {
				next = applyText(source, board);
			} catch (error) {
				if (!(error instanceof StoryMapParseError)) throw error;
				return error.problems;
			}

			send({ type: 'applyText', board: next });
			setDirty(true);
			return [];
		},
		[board],
	);

	const exportFile = useCallback(() => {
		downloadText(filenameFor(board.title), serialize(toDocument(board)));
		setDirty(false);
	}, [board]);

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
		(storyId: Id) => {
			const story = board.stories[storyId];
			if (!story) return;
			const entered = window.prompt(
				'Ticket id, exactly as the ticketing system spells it.\nLeave it empty to unlink.',
				story.ticket ?? '',
			);
			// Cancel is null and means "leave it alone"; an empty string is a
			// deliberate unlink. They are different answers and are treated so.
			if (entered === null) return;
			dispatch({ type: 'setTicket', id: storyId, ticket: entered });
		},
		[board.stories, dispatch],
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
		async (storyId: Id) => {
			const story = board.stories[storyId];
			if (!story) return;
			setTicketError(null);

			let payload: { id?: string; status?: StoryStatus; error?: string };
			try {
				const response = await fetch('/api/ticket', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ product: board.product, title: story.title }),
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

			dispatch({ type: 'setTicket', id: storyId, ticket: payload.id });
			dispatch({ type: 'setStatus', id: storyId, status: payload.status });
		},
		[board.stories, board.product, dispatch],
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

	const space = effectiveSpace(board);
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
					body: JSON.stringify({ space, product: board.product, title: story.title }),
				});
				payload = await response.json();
			} catch {
				payload = { error: 'Could not reach doc-sm to raise the ticket.' };
			}

			if (payload.id && payload.status) {
				dispatch({ type: 'setTicket', id: story.id, ticket: payload.id });
				dispatch({ type: 'setStatus', id: story.id, status: payload.status });
			} else {
				failures.push({ title: story.title, error: payload.error ?? 'The ticket could not be created.' });
			}

			setProgress({ done: index + 1, total: targets.length, failures: [...failures], running: true });
		}

		setProgress({ done: targets.length, total: targets.length, failures, running: false });
	}, [board, space, dispatch]);

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

			if (activeData?.type === 'release') {
				const index = board.releaseOrder.indexOf(overId);
				if (index !== -1) dispatch({ type: 'moveRelease', releaseId: activeId, index });
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

	const empty = board.activityOrder.length === 0 && board.releaseOrder.length === 0;

	return (
		<div
			ref={stage}
			className={`flex flex-col gap-4 ${
				fullscreen ? 'h-screen overflow-hidden bg-white p-4 dark:bg-night' : ''
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
				onPreview={() => setPreviewing(true)}
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
				onAddActivity={() => dispatch({ type: 'addActivity', index: board.activityOrder.length })}
				onAddRelease={() => dispatch({ type: 'addRelease', index: board.releaseOrder.length })}
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
				detailShown={anyExpanded}
				canToggleDetail={detailed.length > 0}
				onToggleAllDetail={toggleAllDetail}
			/>

			<ProblemList problems={problems} onDismiss={() => setProblems([])} />

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

			<PreviewDialog
				open={previewing}
				filename={filenameFor(board.title)}
				text={preview}
				onApply={applyPreview}
				onClose={() => setPreviewing(false)}
			/>

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
							expanded={expanded}
							onToggleDetail={toggleDetail}
						/>

						{/* Mandatory, not decorative: the board scrolls, and a card
						    dragged by transform inside an overflow:auto container is
						    clipped at its edge. The overlay renders outside the flow
						    and is the only way a card crosses the board. */}
						<DragOverlay dropAnimation={null}>
							{dragging && (
								<div
									style={{ fontSize: `${13 * zoom}px` }}
									className={`rounded-[0.4em] border px-[0.55em] py-[0.4em] text-[1em] shadow-lg ${cardClass[dragging.kind]}`}
								>
									{dragging.title}
								</div>
							)}
						</DragOverlay>
					</div>
				</DndContext>
			)}
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

function nameOf(board: BoardState, id: string): string {
	if (board.stories[id]) return `${kindLabel.story} ${board.stories[id]!.title}`;
	if (board.steps[id]) return `${kindLabel.step} ${board.steps[id]!.title}`;
	if (board.activities[id]) return `${kindLabel.activity} ${board.activities[id]!.title}`;
	if (board.releases[id]) return `Release ${board.releases[id]!.title}`;
	return 'the card';
}

function placeOf(board: BoardState, id: string): string {
	if (id.includes('|')) {
		const { stepId, band } = splitCellKey(id);
		const stepTitle = board.steps[stepId]?.title ?? 'a step';
		const bandTitle = band === UNASSIGNED ? 'below the line' : board.releases[band]?.title ?? 'a release';
		return `${stepTitle}, ${bandTitle}`;
	}
	const found = bandOrder(board).includes(id) ? board.releases[id]?.title : undefined;
	return found ? `the ${found} band` : nameOf(board, id);
}
