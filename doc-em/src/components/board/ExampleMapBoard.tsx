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
import { reduce, resetsHistory, type BoardAction, type QuestionParent } from '../../lib/board/reducer.ts';
import { cardsWithDetail, emptyBoard, type BoardState, type Id } from '../../lib/board/state.ts';
import { featureFilename, toGherkin, unwritableQuestions } from '../../lib/examplemap/gherkin.ts';
import { cardLabel, type CardKind } from '../../lib/examplemap/model.ts';
import { parse } from '../../lib/examplemap/parser.ts';
import { ExampleMapParseError, type Problem } from '../../lib/examplemap/problems.ts';
import { SAMPLE_SOURCE } from '../../lib/examplemap/sample.ts';
import { serialize } from '../../lib/examplemap/serialize.ts';
import { BASE_FONT, BoardGrid } from './BoardGrid.tsx';
import { PreviewDialog, type GherkinPreview } from './PreviewDialog.tsx';
import { ProblemList } from './ProblemList.tsx';
import { Readings } from './Readings.tsx';
import { Toolbar } from './Toolbar.tsx';

const HISTORY_LIMIT = 100;
const ZOOM_STOPS = [1, 1.15, 1.3, 1.45, 1.6] as const;
const DEFAULT_ZOOM_INDEX = 0;

const step = undoable<BoardState, BoardAction>(reduce, { limit: HISTORY_LIMIT, resets: resetsHistory });

export default function ExampleMapBoard() {
	const [history, send] = useReducer(
		step as (state: History<BoardState>, action: BoardAction | HistoryAction) => History<BoardState>,
		undefined,
		/*
		 * A board opens with a story card that says "To be defined".
		 *
		 * Not an empty page: the session is defined as taking one story, so the
		 * card that names it exists before anything else does, waiting to be
		 * written. Starting blank would make the first move "add a story", which
		 * is not a move anyone in the room makes.
		 */
		() => initialHistory(emptyBoard()),
	);
	const board = history.present;

	const [problems, setProblems] = useState<readonly Problem[]>([]);
	const [dirty, setDirty] = useState(false);
	const [previewing, setPreviewing] = useState(false);
	const [documentKey, setDocumentKey] = useState(0);
	const [zoomIndex, setZoomIndex] = useState(DEFAULT_ZOOM_INDEX);
	const [fullscreen, setFullscreen] = useState(false);
	const [expanded, setExpanded] = useState<ReadonlySet<Id>>(() => new Set());
	const [dragging, setDragging] = useState<{ kind: CardKind; title: string } | null>(null);
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
			if (!(error instanceof ExampleMapParseError)) throw error;
			// The board is untouched. That is the whole contract of a failed import.
			setProblems(error.problems);
		}
	}, []);

	const applyPreview = useCallback((source: string): readonly Problem[] => {
		try {
			resetIds();
			const next = toBoard(parse(source));
			// `applyText`, not `import`: this is an edit of the map you already have,
			// and undoing it must bring the old board back.
			send({ type: 'applyText', board: next });
			setDirty(true);
			return [];
		} catch (error) {
			if (!(error instanceof ExampleMapParseError)) throw error;
			return error.problems;
		}
	}, []);

	const preview = useMemo(
		() => (previewing ? serialize(toDocument(board)) : ''),
		[previewing, board],
	);

	/**
	 * The feature file for whatever is currently in the preview's map tab.
	 *
	 * Passed in as a function rather than as text so the Gherkin tab tracks the
	 * draft: edit the map there and the feature file follows, without the dialog
	 * needing to know how to parse anything.
	 */
	const gherkinPreview = useCallback((source: string): GherkinPreview => {
		try {
			const parsed = parse(source);
			return {
				ok: true,
				filename: featureFilename(parsed),
				text: toGherkin(parsed),
				unwritable: unwritableQuestions(parsed),
			};
		} catch (error) {
			if (!(error instanceof ExampleMapParseError)) throw error;
			return { ok: false, problems: error.problems };
		}
	}, []);

	const exportFile = useCallback(() => {
		downloadText(filenameFor(board.title), serialize(toDocument(board)));
		setDirty(false);
	}, [board]);

	/**
	 * Write the feature file.
	 *
	 * Deliberately does *not* clear the dirty flag. The Gherkin is what the map
	 * produced, not the map: a session that has written its feature file has
	 * still not saved its red cards, and telling them otherwise would lose the
	 * half of the board the practice says matters most.
	 */
	const exportGherkin = useCallback(() => {
		const document = toDocument(board);
		const open = unwritableQuestions(document);
		if (open > 0) {
			const proceed = window.confirm(
				`${open} open ${open === 1 ? 'question is' : 'questions are'} not written to a feature file — ` +
					'an open question is not a specification, so Gherkin has no keyword for it.\n\n' +
					'Export the feature file anyway? The .examplemap file keeps them.',
			);
			if (!proceed) return;
		}
		downloadText(featureFilename(document), toGherkin(document));
	}, [board]);

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
			if (type === 'rule') return data?.type === 'rule';
			return data?.accepts === type || data?.type === type;
		});
		return closestCenter({ ...args, droppableContainers: containers });
	}, []);

	const onDragStart = useCallback(
		(event: DragStartEvent) => {
			const type = event.active.data.current?.type as CardKind | undefined;
			const id = String(event.active.id);
			const title =
				type === 'rule' ? board.rules[id]?.title : type === 'example' ? board.examples[id]?.title : board.questions[id]?.title;
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

			if (activeData?.type === 'example') {
				const fromRuleId = String(activeData.ruleId);
				const toRuleId = String(overData?.ruleId ?? fromRuleId);
				const target = board.rules[toRuleId]?.exampleIds ?? [];
				const index = target.indexOf(overId);
				dispatch({
					type: 'moveExample',
					exampleId: activeId,
					fromRuleId,
					toRuleId,
					index: index === -1 ? target.length : index,
				});
				return;
			}

			if (activeData?.type === 'question') {
				const from = activeData.parent as QuestionParent;
				const to = (overData?.parent ?? overData?.parent) as QuestionParent | undefined;
				const parent = to ?? from;
				const target = 'story' in parent ? board.story.questions : board.rules[parent.ruleId]?.questionIds ?? [];
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
		<div
			ref={stage}
			className={`flex flex-col gap-4 ${fullscreen ? 'h-screen overflow-hidden bg-white p-4 dark:bg-night' : ''}`}
		>
			<Toolbar
				title={board.title}
				dirty={dirty}
				canUndo={canUndo(history)}
				canRedo={canRedo(history)}
				onTitle={(title) => dispatch({ type: 'setMapTitle', title })}
				onPickFile={async (file, input) => {
					const text = await readTextFile(file);
					clearFileInput(input);
					load(text);
				}}
				onExport={exportFile}
				onExportGherkin={exportGherkin}
				onPreview={() => setPreviewing(true)}
				onLoadSample={() => load(SAMPLE_SOURCE)}
				onAddRule={() => dispatch({ type: 'addRule', index: board.ruleOrder.length })}
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
				onToggleAllDetail={() => setExpanded(anyExpanded ? new Set() : new Set(detailed))}
			/>

			<ProblemList problems={problems} subject="This map" onDismiss={() => setProblems([])} />
			<Readings board={board} />

			<PreviewDialog
				open={previewing}
				filename={filenameFor(board.title)}
				text={preview}
				onApply={applyPreview}
				onGherkin={gherkinPreview}
				onClose={() => setPreviewing(false)}
			/>

			<DndContext
				sensors={sensors}
				collisionDetection={collisionDetection}
				onDragStart={onDragStart}
				onDragEnd={onDragEnd}
				onDragCancel={() => setDragging(null)}
				accessibility={{ announcements }}
			>
				<div className={fullscreen ? 'flex min-h-0 flex-1 flex-col' : undefined}>
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
								className={`rounded-[0.4em] border px-[0.55em] py-[0.4em] text-[1em] shadow-lg ${cardClass[dragging.kind]}`}
							>
								{dragging.title}
							</div>
						)}
					</DragOverlay>
				</div>
			</DndContext>
		</div>
	);
}

function nameOf(board: BoardState, id: string): string {
	if (board.rules[id]) return `${cardLabel.rule} ${board.rules[id]!.title}`;
	if (board.examples[id]) return `${cardLabel.example} ${board.examples[id]!.title}`;
	if (board.questions[id]) return `${cardLabel.question} ${board.questions[id]!.title}`;
	return 'the card';
}
