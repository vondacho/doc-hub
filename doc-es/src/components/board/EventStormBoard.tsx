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
		 * A board opens with one empty phase.
		 *
		 * Not a blank page: the practice starts with paper on a wall, and the wall
		 * exists before anybody has written on it. It is also what gives the first
		 * row of `+` somewhere to be — see the note at the top of BoardGrid.
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
	const [dragging, setDragging] = useState<{ kind: CardKind | 'phase'; title: string } | null>(null);
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
			// A phase reorders among phases and against nothing else. Without this a
			// phase dragged sideways would collide with the columns beneath it,
			// which are much larger targets.
			if (type === 'phase') return data?.type === 'phase';
			return data?.accepts === type || data?.type === type;
		});
		return closestCenter({ ...args, droppableContainers: containers });
	}, []);

	const onDragStart = useCallback(
		(event: DragStartEvent) => {
			const type = event.active.data.current?.type as 'card' | 'phase' | undefined;
			const id = String(event.active.id);
			const title = type === 'phase' ? board.phases[id]?.title : board.cards[id]?.title;
			if (type === undefined || title === undefined) {
				setDragging(null);
				return;
			}
			setDragging({ kind: type === 'phase' ? 'phase' : (board.cards[id]?.kind ?? 'event'), title });
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

			if (activeData?.type === 'phase') {
				const index = board.phaseOrder.indexOf(overId);
				if (index !== -1) dispatch({ type: 'movePhase', id: activeId, index });
				return;
			}

			if (activeData?.type === 'card') {
				// The drop is either on a phase column (its own `phaseId` datum) or
				// on another card, whose datum names the phase it is in.
				const from = String(activeData.phaseId);
				const to = String(overData?.phaseId ?? from);
				const target = board.phases[to]?.cardIds ?? [];
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
		<div
			ref={stage}
			className={`flex flex-col gap-4 ${fullscreen ? 'h-screen overflow-hidden bg-white p-4 dark:bg-night' : ''}`}
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
				onAddPhase={() => dispatch({ type: 'addPhase', index: board.phaseOrder.length })}
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
				onToggleAllDetail={() =>
					setExpanded(anyExpanded ? new Set() : new Set(detailed))
				}
			/>

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
							className={`rounded-[0.4em] border px-[0.55em] py-[0.4em] text-[1em] shadow-lg ${
								// A phase is a boundary, not a sticky note, so it drags as a
								// plain opaque label — which is also how it looks at rest.
								dragging.kind === 'phase'
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
	const phase = board.phases[id];
	if (phase) return `phase ${phase.title}`;
	return 'the card';
}
