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
import * as storage from '../../lib/storage.ts';
import { resetIds, toBoard, toDocument } from '../../lib/board/convert.ts';
import {
	canRedo,
	canUndo,
	initialHistory,
	undoable,
	type History,
	type HistoryAction,
} from '../../lib/board/history.ts';
import { cardClass } from '../../lib/board/kinds.ts';
import { reduce, resetsHistory, type BoardAction } from '../../lib/board/reducer.ts';
import { cardsWithDetail, type BoardState, type Id } from '../../lib/board/state.ts';
import { cardLabel, emptyDocument, type CardKind } from '../../lib/eventstorm/model.ts';
import { Legend } from './Legend.tsx';
import { parse } from '../../lib/eventstorm/parser.ts';
import { EventStormParseError, type Problem } from '../../lib/eventstorm/problems.ts';
import { SAMPLE_SOURCE } from '../../lib/eventstorm/sample.ts';
import { serialize } from '../../lib/eventstorm/serialize.ts';
import { BASE_FONT, BoardGrid } from './BoardGrid.tsx';
import { OpenDialog } from './OpenDialog.tsx';
import { PreviewDialog } from './PreviewDialog.tsx';
import { ProblemList } from './ProblemList.tsx';
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

const step = undoable<BoardState, BoardAction>(reduce, { limit: HISTORY_LIMIT, resets: resetsHistory });

export default function EventStormBoard({
	products,
	productsUnavailable,
	registryUrl,
}: {
	/** The registered products, read once on the server. See src/lib/products.ts. */
	products: readonly Product[];
	/** Why the list is empty, when the registry could not be read. */
	productsUnavailable: string | null;
	/** The registry's admin UI, for the "register one" links. Browser-facing. */
	registryUrl: string;
}) {
	const [history, send] = useReducer(
		step as (state: History<BoardState>, action: BoardAction | HistoryAction) => History<BoardState>,
		undefined,
		/*
		 * A board opens with one empty lane and a full width of empty squares.
		 *
		 * Not a blank page: the practice starts with paper on a wall, and the wall
		 * exists before anybody has written on it. See the note at the top of
		 * BoardGrid for why the grid is drawn wider than the work on it.
		 */
		() => initialHistory(toBoard(emptyDocument())),
	);
	const board = history.present;

	const [problems, setProblems] = useState<readonly Problem[]>([]);
	const [dirty, setDirty] = useState(false);
	const [stored, setStored] = useState<{ at: number } | { error: string } | null>(null);
	const [opening, setOpening] = useState(false);
	const [savedKeys, setSavedKeys] = useState<readonly string[]>([]);
	const [previewing, setPreviewing] = useState(false);
	const [documentKey, setDocumentKey] = useState(0);
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
	/** What the page is showing right now, so the toggle can offer the opposite. */
	const [pageIsDark, setPageIsDark] = useState(false);
	const [dragging, setDragging] = useState<{ kind: CardKind | 'lane'; title: string } | null>(null);
	const stage = useRef<HTMLDivElement>(null);

	const dispatch = useCallback((action: BoardAction) => {
		send(action);
		setDirty(true);
	}, []);

	/* ---- opening and saving ------------------------------------------------ */

	const load = useCallback((source: string) => {
		try {
			resetIds();
			const next = toBoard(parse(source));
			setProblems([]);
			send({ type: 'import', board: next });
			setDocumentKey((n) => n + 1);
			setDirty(false);
		} catch (error) {
			if (!(error instanceof EventStormParseError)) throw error;
			// The board is untouched. That is the whole contract of a failed import.
			setProblems(error.problems);
		}
	}, []);

	const applyPreview = useCallback((source: string): readonly Problem[] => {
		try {
			resetIds();
			const next = toBoard(parse(source));
			// `applyText`, not `import`: this is an edit of the storm you already
			// have, and undoing it must bring the old board back.
			send({ type: 'applyText', board: next });
			setDirty(true);
			return [];
		} catch (error) {
			if (!(error instanceof EventStormParseError)) throw error;
			return error.problems;
		}
	}, []);

	const preview = useMemo(() => (previewing ? serialize(toDocument(board)) : ''), [previewing, board]);

	const exportFile = useCallback(() => {
		downloadText(filenameFor(board.product, board.title), serialize(toDocument(board)));
		setDirty(false);
	}, [board]);

	/* ---- the browser's copy ------------------------------------------------ */

	const key = storageKeyOf(board);

	const persist = useCallback((state: BoardState) => {
		const result = storage.save(storageKeyOf(state), serialize(toDocument(state)));
		setStored(storage.failed(result) ? { error: result.error } : { at: Date.now() });
	}, []);

	/** Follow a rename, so one board keeps one entry. See doc-em for the argument. */
	const previousKey = useRef<string | null>(null);
	useEffect(() => {
		const was = previousKey.current;
		previousKey.current = key;
		if (was !== null && was !== key) storage.rename(was, key);
	}, [key]);

	useEffect(() => {
		if (!dirty) return;
		const timer = setTimeout(() => persist(board), AUTOSAVE_DELAY_MS);
		return () => clearTimeout(timer);
	}, [board, dirty, persist]);

	useEffect(() => {
		const last = storage.lastOpened();
		if (last === null) return;
		const text = storage.load(last);
		if (text === null) return;
		try {
			resetIds();
			send({ type: 'import', board: toBoard(parse(text)) });
			setDocumentKey((n) => n + 1);
			previousKey.current = last;
		} catch (error) {
			if (!(error instanceof EventStormParseError)) throw error;
			setProblems(error.problems);
		}
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
				onExport={exportFile}
				onPreview={() => setPreviewing(true)}
				onSave={() => persist(board)}
				onOpenSaved={() => {
					setSavedKeys(storage.saved());
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
				detailShown={anyExpanded}
				canToggleDetail={detailed.length > 0}
				onToggleAllDetail={() =>
					setExpanded(anyExpanded ? new Set() : new Set(detailed))
				}
			/>

			<Legend board={board} onLevel={(level) => dispatch({ type: 'setLevel', level })} />

			{problems.length > 0 && <ProblemList problems={problems} />}

			<DndContext
				sensors={sensors}
				collisionDetection={collisionDetection}
				accessibility={{ announcements }}
				onDragStart={onDragStart}
				onDragEnd={onDragEnd}
				onDragCancel={() => setDragging(null)}
			>
				<BoardGrid
					board={board}
					dispatch={dispatch}
					zoom={zoom}
					fullscreen={fullscreen}
					documentKey={documentKey}
					expanded={expanded}
					onToggleDetail={toggleDetail}
				/>

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

			<OpenDialog
				open={opening}
				keys={savedKeys}
				current={key}
				onOpen={(pick) => {
					const text = storage.load(pick);
					setOpening(false);
					if (text !== null) load(text);
				}}
				onDelete={(pick) => {
					storage.remove(pick);
					setSavedKeys(storage.saved());
				}}
				onClose={() => setOpening(false)}
			/>

			<PreviewDialog
				open={previewing}
				filename={filenameFor(board.product, board.title)}
				text={preview}
				onApply={applyPreview}
				onClose={() => setPreviewing(false)}
			/>
		</div>
	);
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
