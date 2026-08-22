/**
 * The board: the timeline down the left, the story across the top of the rest,
 * and the rules as columns beneath it.
 *
 * The layout is the technique's own, and the practice describes it as an
 * instruction rather than a suggestion — "write the story, write the rules under
 * it, under each rule write examples until everyone agrees the rule is
 * understood". So: one story spanning the width, its own questions beside it,
 * then a column per rule holding that rule's examples and then its questions.
 *
 * It used to be simpler than doc-sm's grid, on the argument that there was no
 * second axis. Deliveries are that second axis. A rule is still the column an
 * example belongs to; a sprint is now the row it ships in, and the cell where
 * the two meet is the whole statement of "this case, under that rule, in that
 * sprint".
 *
 * Questions are the one thing that stayed out of the grid. A question is not
 * delivered — it is answered, usually before anything ships — so it sits in a
 * strip directly under its rule's header, above every band, rather than being
 * given a row it has no business in.
 *
 * ## The left column belongs to the timeline, all the way up
 *
 * The story card starts at column 2, not column 1. It used to span the full
 * width, which put the "Deliveries" heading and the first band's label in the
 * same column as a card that had nothing to do with either — and a band label
 * has to sit level with the row it names, not underneath a story that spans
 * over the top of it.
 *
 * So column 1 is the rail's for the whole height: an opaque backdrop, a sticky
 * corner heading, and one label per band. Four z-indexes keep that readable and
 * each is load-bearing — the corner at 30 sticks in both directions and must
 * outrank everything, the header band at 5 must sit above the band labels at 4
 * so they scroll under it vertically, and the rail backdrop at 3 must sit above
 * the cells so they scroll under it sideways.
 *
 * What is kept from doc-sm, deliberately: the em-based sizing so one font-size
 * scales the whole board, the sticky header that pins where it rests, the
 * padding living outside the scrollport, and the opaque band behind the header.
 * Those were all bought with real bugs; none of them is re-learned here.
 */

import { SortableContext, horizontalListSortingStrategy, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
	cardLabel,
	clauseKeyword,
	STEP_CLAUSES,
	STORY_STATUSES,
	storyStatusLabel,
	type StepClause,
	type StoryStatus,
} from '../../lib/examplemap/model.ts';
import type { BoardAction, QuestionParent } from '../../lib/board/reducer.ts';
import {
	bands,
	cellKey,
	examplesIn,
	splitCellKey,
	STORY_DETAIL_KEY,
	UNSCHEDULED,
	type BandId,
	type BoardState,
	type Example,
	type Id,
} from '../../lib/board/state.ts';
import { Card } from './Card.tsx';
import { DeliveryRail } from './DeliveryRail.tsx';
import { StoryMeta } from './StoryMeta.tsx';
import { StoryNeed } from './StoryNeed.tsx';
import { ExampleSteps } from './ExampleSteps.tsx';
import type { CardMenuAction } from './CardMenu.tsx';
import { Icon } from './Icon.tsx';

/**
 * Track widths in `em`, against the font-size the scroll container gets from the
 * zoom level. One number moves the whole board — without a `transform`, which
 * would break the sticky header and confuse dnd-kit's hit-testing.
 */
/**
 * The delivery rail's own column, and the reason the story starts at column 2.
 *
 * The left edge belongs to the timeline for the whole height of the board: a
 * band label has to sit level with the row it names, and a story card spanning
 * over the top of the rail would put the first band's label under the story
 * rather than beside the cards it applies to.
 *
 * Wider than doc-sm's 8.5em because a label here carries more: a title, a
 * ticket, the sprint/release toggle and the points box.
 */
const RAIL = '10.5em';
const COLUMN = '13em';
/** Font-size at 100%, in px. Everything on the board is `em` against this. */
export const BASE_FONT = 20.8;

const STORY_ROW = 1;
const RULE_ROW = 2;
/** Questions hang off the rule, above the timeline, and take one row. */
const QUESTION_ROW = 3;
/** The first band. Every delivery adds a row, and below-the-line is the last. */
const FIRST_BAND_ROW = 4;

export function BoardGrid({
	board,
	dispatch,
	zoom,
	fullscreen,
	documentKey,
	expanded,
	onToggleDetail,
}: {
	board: BoardState;
	dispatch: (action: BoardAction) => void;
	zoom: number;
	fullscreen: boolean;
	documentKey: number;
	expanded: ReadonlySet<Id>;
	onToggleDetail: (id: Id) => void;
}) {
	const scroller = useRef<HTMLDivElement>(null);
	const grid = useRef<HTMLDivElement>(null);
	const [ruleTop, setRuleTop] = useState(0);

	// A new map is read from its top-left corner.
	useLayoutEffect(() => {
		const element = scroller.current;
		if (!element) return;
		element.scrollLeft = 0;
		element.scrollTop = 0;
	}, [documentKey]);

	/*
	 * The rule row pins below the story row, and how far below is a number nobody
	 * can write down: the story card grows with the zoom, with its notes, and
	 * with how many questions sit beside it. So it is measured, as doc-sm learned
	 * to do after guessing it once.
	 */
	useLayoutEffect(() => {
		const element = grid.current;
		if (!element) return;
		const measure = () => {
			const style = getComputedStyle(element);
			const first = Number.parseFloat(style.gridTemplateRows.split(' ')[0] ?? '');
			const gap = Number.parseFloat(style.rowGap) || 0;
			if (!Number.isFinite(first)) return;
			const next = first + gap;
			setRuleTop((was) => (was === next ? was : next));
		};
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	// Column 1 is the delivery rail, which claims it itself; the rules follow it.
	// A rule at index `i` is therefore in column `i + 2`, and that offset is
	// written once here rather than as a `+ 2` at each place that needs it.
	const columnOfRule = (index: number): number => index + 2;
	const columns = Math.max(1, board.ruleOrder.length) + 1;
	const rows = bands(board);

	return (
		<div
			className={`relative border border-slate-200 bg-white dark:border-slate-700 dark:bg-night-raised ${
				fullscreen ? 'flex min-h-0 flex-1 flex-col rounded-xl p-4' : 'rounded-2xl p-3'
			}`}
		>
			{/* The padding is out here, so nothing scrolls through a strip the
			    sticky rows cannot reach. */}
			<div
				ref={scroller}
				className={`board-scroll ${fullscreen ? 'min-h-0 flex-1' : ''}`}
				style={{ maxHeight: fullscreen ? '100%' : '75vh', fontSize: `${BASE_FONT * zoom}px` }}
			>
				<div
					ref={grid}
					className="grid min-w-max gap-[0.4em]"
					style={{ gridTemplateColumns: `${RAIL} repeat(${columns - 1}, minmax(${COLUMN}, 1fr))` }}
				>
					{/* Opaque behind the two header rows: the cards are opaque but the
					    grid's gaps are not. Starts at column 2 — column 1 is the rail's,
					    and the corner below paints it. */}
					<div
						aria-hidden="true"
						style={{ gridColumn: '2 / -1', gridRow: `${STORY_ROW} / span 2` }}
						className="sticky top-0 z-[5] -mb-[0.2em] bg-white pb-[0.2em] dark:bg-night-raised"
					/>

					{/*
					 * Opaque behind the rail, for the full height of the board.
					 *
					 * The row end is counted, not `-1`.
					 *
					 * `-1` names the last line of the *explicit* grid, and this grid
					 * declares only `grid-template-columns` — every row is implicit. So
					 * `1 / -1` collapses to a single row, and the backdrop would cover
					 * the header's height alone, letting every card below it show
					 * through the left padding on a sideways scroll. The header band
					 * above gets away with `-1` because the *columns* are explicit.
					 */}
					<div
						aria-hidden="true"
						style={{ gridColumn: 1, gridRow: `1 / ${FIRST_BAND_ROW + rows.length}` }}
						className="sticky left-0 z-[3] -mr-[0.2em] bg-white pr-[0.2em] dark:bg-night-raised"
					/>

					{/* Top-left corner. Sticks in both directions, so it must outrank
					    both the rail and the header rows. */}
					<div
						style={{ gridColumn: 1, gridRow: `${STORY_ROW} / span 2` }}
						className="sticky top-0 left-0 z-30 rounded-[0.4em] bg-white px-[0.5em] py-[0.25em] text-[0.7em] font-semibold tracking-[0.14em] text-ink-muted uppercase dark:bg-night-raised dark:text-slate-400"
					>
						Deliveries
					</div>

					{/* ---- the story, and the doubts about the story ---- */}
					<div
						style={{ gridColumn: '2 / -1', gridRow: STORY_ROW }}
						className="sticky top-0 z-10 flex flex-wrap items-start gap-[0.4em]"
					>
						<Card
							id={STORY_DETAIL_KEY}
							kind="story"
							title={board.story.title}
							notes={board.story.notes}
							fixed
							data={{ type: 'story' }}
							detailOpen={expanded.has(STORY_DETAIL_KEY)}
							onToggleDetail={() => onToggleDetail(STORY_DETAIL_KEY)}
							detailName="the need"
							detailContent={
								<StoryNeed
									story={board.story}
									onClause={(field, text) => dispatch({ type: 'setStoryNeed', field, text })}
								/>
							}
							onRetitle={(title) => dispatch({ type: 'retitle', kind: 'story', id: '', title })}
							onNotes={(text) => dispatch({ type: 'setNotes', kind: 'story', id: '', text })}
							menu={[
								{
									label: 'Add a note',
									run: () =>
										dispatch({
											type: 'setNotes',
											kind: 'story',
											id: '',
											text: board.story.notes.length > 0 ? `${board.story.notes.join('\n\n')}\n\nNew note` : 'New note',
										}),
								},
								{ label: 'Ask a question about the story', separated: true, run: () => dispatch({ type: 'addQuestion', parent: { story: true } }) },
								...statusActions(dispatch, board.story.status, board.story.ticket !== null),
								...releaseActions(board, dispatch),
							]}
							className="min-w-[16em] flex-1"
						>
							<StoryMeta
								ticket={board.story.ticket}
								status={board.story.status}
								release={board.story.release === null ? null : (board.deliveries[board.story.release]?.title ?? null)}
							/>
						</Card>

						<QuestionStrip
							board={board}
							dispatch={dispatch}
							parent={{ story: true }}
							ids={board.story.questions}
							expanded={expanded}
							onToggleDetail={onToggleDetail}
						/>
					</div>

					{/* ---- the rules ---- */}
					<SortableContext items={[...board.ruleOrder]} strategy={horizontalListSortingStrategy}>
						{board.ruleOrder.map((ruleId, index) => {
							const rule = board.rules[ruleId];
							if (!rule) return null;
							return (
								<Card
									key={ruleId}
									id={ruleId}
									kind="rule"
									title={rule.title}
									notes={rule.notes}
									position={`rule ${index + 1} of ${board.ruleOrder.length}`}
									data={{ type: 'rule' }}
									detailOpen={expanded.has(ruleId)}
									onToggleDetail={() => onToggleDetail(ruleId)}
									onRetitle={(title) => dispatch({ type: 'retitle', kind: 'rule', id: ruleId, title })}
									onNotes={(text) => dispatch({ type: 'setNotes', kind: 'rule', id: ruleId, text })}
									menu={ruleMenu(board, dispatch, ruleId, index)}
									className="sticky z-10"
									style={{ gridColumn: columnOfRule(index), gridRow: RULE_ROW, top: ruleTop }}
								/>
							);
						})}
					</SortableContext>

					{/* An empty board still has a column, so the first rule has
					    somewhere to be added from. */}
					{board.ruleOrder.length === 0 && (
						<button
							type="button"
							onClick={() => dispatch({ type: 'addRule', index: 0 })}
							aria-label="Add the first rule"
							style={{ gridColumn: columnOfRule(0), gridRow: RULE_ROW }}
							className="flex items-center justify-center rounded-[0.4em] border border-dashed border-slate-300 px-2 py-[0.4em] text-ink-muted hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand dark:border-slate-600 dark:text-slate-400 dark:hover:border-sky-400 dark:hover:text-sky-400"
						>
							<Icon name="plus" className="h-[1em] w-[1em]" />
						</button>
					)}

					{/* ---- the timeline down the left ---- */}
					<DeliveryRail board={board} dispatch={dispatch} firstRow={FIRST_BAND_ROW} />

					{/* ---- the questions on each rule, above every band ---- */}
					{board.ruleOrder.map((ruleId, index) => {
						const rule = board.rules[ruleId];
						if (!rule) return null;
						return (
							<div
								key={`q-${ruleId}`}
								style={{ gridColumn: columnOfRule(index), gridRow: QUESTION_ROW }}
								className="group/q flex flex-col gap-[0.3em]"
							>
								<QuestionStrip
									board={board}
									dispatch={dispatch}
									parent={{ ruleId }}
									ids={rule.questionIds}
									expanded={expanded}
									onToggleDetail={onToggleDetail}
									stacked
								/>
								<div className="flex gap-1 opacity-0 transition group-hover/q:opacity-100 focus-within:opacity-100 motion-reduce:transition-none">
									<Add
										label={`Ask a question about ${rule.title}`}
										onClick={() => dispatch({ type: 'addQuestion', parent: { ruleId } })}
									>
										Question
									</Add>
								</div>
							</div>
						);
					})}

					{/* ---- one cell per rule per band ---- */}
					{board.ruleOrder.flatMap((ruleId, index) =>
						rows.map((band, bandIndex) => (
							<ExampleCell
								key={`cell-${ruleId}-${band}`}
								board={board}
								dispatch={dispatch}
								ruleId={ruleId}
								band={band}
								column={columnOfRule(index)}
								row={FIRST_BAND_ROW + bandIndex}
								expanded={expanded}
								onToggleDetail={onToggleDetail}
							/>
						)),
					)}
				</div>
			</div>
		</div>
	);
}

/**
 * One cell: the examples of one rule that ship in one band.
 *
 * The drop target *is* the schedule. Dragging a card from the "Sprint 2" row to
 * the "Sprint 1" row is how an example is brought forward, and dragging it
 * sideways is how it is re-filed under a different rule — the same gesture, one
 * action, one undo step. Nothing on the card itself records where it is; see the
 * note at the top of src/lib/board/state.ts for why that is the whole point.
 *
 * Every cell exists in the DOM even when it is empty, unlike the `cells` record
 * which only holds the ones with something in them. An empty cell is a drop
 * target and a place to click `+`, so it has to be there; it is one dashed
 * rectangle and costs nothing.
 */
function ExampleCell({
	board,
	dispatch,
	ruleId,
	band,
	column,
	row,
	expanded,
	onToggleDetail,
}: {
	board: BoardState;
	dispatch: (action: BoardAction) => void;
	ruleId: Id;
	band: BandId;
	column: number;
	row: number;
	expanded: ReadonlySet<Id>;
	onToggleDetail: (id: Id) => void;
}) {
	const rule = board.rules[ruleId];
	const key = cellKey(ruleId, band);
	const { setNodeRef, isOver } = useDroppable({ id: `cell:${key}`, data: { accepts: 'example', cell: key } });
	if (!rule) return null;

	const ids = examplesIn(board, ruleId, band);
	const where = band === UNSCHEDULED ? 'below the line' : (board.deliveries[band]?.title ?? 'this band');

	return (
		<div
			ref={setNodeRef}
			style={{ gridColumn: column, gridRow: row }}
			className={`group/cell flex min-h-[3em] flex-col gap-[0.3em] rounded-[0.4em] border border-dashed p-[0.3em] transition-colors motion-reduce:transition-none ${
				isOver ? 'border-brand bg-brand/5 dark:border-sky-400 dark:bg-sky-400/10' : 'border-slate-200 dark:border-slate-700'
			}`}
		>
			<ul aria-label={`Examples for ${rule.title} in ${where}`} className="flex flex-col gap-[0.3em]">
				<SortableContext items={[...ids]} strategy={verticalListSortingStrategy}>
					{ids.map((id, index) => {
						const card = board.examples[id];
						if (!card) return null;
						return (
							<li key={id}>
								<Card
									id={id}
									kind="example"
									title={card.title}
									notes={card.notes}
									position={`${index + 1} of ${ids.length} under "${rule.title}", ${where}`}
									data={{ type: 'example', cell: key }}
									detailOpen={expanded.has(id)}
									onToggleDetail={() => onToggleDetail(id)}
									onRetitle={(title) => dispatch({ type: 'retitle', kind: 'example', id, title })}
									onNotes={(text) => dispatch({ type: 'setNotes', kind: 'example', id, text })}
									detailName="the scenario"
									detailContent={
										<ExampleSteps
											example={card}
											onStep={(clause, at, text) =>
												dispatch({ type: 'setStep', exampleId: id, clause, index: at, text })
											}
										/>
									}
									menu={exampleMenu(board, dispatch, id, card, key)}
								/>
							</li>
						);
					})}
				</SortableContext>
			</ul>

			<div className="flex gap-1 opacity-0 transition group-hover/cell:opacity-100 focus-within:opacity-100 motion-reduce:transition-none">
				<Add
					label={`Add an example to ${rule.title} in ${where}`}
					onClick={() => dispatch({ type: 'addExample', ruleId, band })}
				>
					Example
				</Add>
			</div>
		</div>
	);
}


function QuestionStrip({
	board,
	dispatch,
	parent,
	ids,
	expanded,
	onToggleDetail,
	stacked = false,
}: {
	board: BoardState;
	dispatch: (action: BoardAction) => void;
	parent: QuestionParent;
	ids: readonly Id[];
	expanded: ReadonlySet<Id>;
	onToggleDetail: (id: Id) => void;
	stacked?: boolean;
}) {
	const key = 'story' in parent ? 'questions:story' : `questions:${parent.ruleId}`;
	const { setNodeRef, isOver } = useDroppable({ id: key, data: { accepts: 'question', parent } });

	if (ids.length === 0 && !isOver) return <div ref={setNodeRef} className={stacked ? '' : 'hidden'} />;

	return (
		<ul
			ref={setNodeRef}
			aria-label={'story' in parent ? 'Questions about the story' : 'Questions about this rule'}
			className={`flex gap-[0.3em] rounded-[0.4em] ${stacked ? 'flex-col' : 'flex-wrap'} ${
				isOver ? 'outline-2 outline-offset-2 outline-brand dark:outline-sky-400' : ''
			}`}
		>
			<SortableContext items={[...ids]} strategy={stacked ? verticalListSortingStrategy : horizontalListSortingStrategy}>
				{ids.map((id, index) => {
					const card = board.questions[id];
					if (!card) return null;
					return (
						<li key={id} className={stacked ? '' : 'min-w-[12em] flex-1'}>
							<Card
								id={id}
								kind="question"
								title={card.title}
								notes={card.notes}
								position={`${index + 1} of ${ids.length}`}
								data={{ type: 'question', parent }}
								detailOpen={expanded.has(id)}
								onToggleDetail={() => onToggleDetail(id)}
								onRetitle={(title) => dispatch({ type: 'retitle', kind: 'question', id, title })}
								onNotes={(text) => dispatch({ type: 'setNotes', kind: 'question', id, text })}
								menu={cardMenu(dispatch, 'question', id, card.notes)}
							/>
						</li>
					);
				})}
			</SortableContext>
		</ul>
	);
}

/**
 * Which delivery the story ships in.
 *
 * Every band is offered, not only the releases. A story that ships in a sprint
 * is unusual rather than impossible — a small one genuinely does — and the board
 * says so in the readings instead of making the choice unavailable. Refusing it
 * here would mean the file could express something the board could not, which is
 * the one asymmetry a round-tripping tool must not have.
 *
 * Empty when there are no bands: "ship this in nothing" is not a decision, and a
 * menu section with one disabled item in it is worse than no section.
 */
function releaseActions(board: BoardState, dispatch: (action: BoardAction) => void): CardMenuAction[] {
	if (board.deliveryOrder.length === 0) return [];

	const actions: CardMenuAction[] = board.deliveryOrder
		.filter((id) => id !== board.story.release)
		.map((id, position) => ({
			label: `Ship in ${board.deliveries[id]?.title ?? 'it'}`,
			separated: position === 0,
			run: () => dispatch({ type: 'setStoryRelease', release: id }),
		}));

	if (board.story.release !== null) {
		actions.push({
			label: 'Not scheduled yet',
			separated: actions.length === 0,
			run: () => dispatch({ type: 'setStoryRelease', release: null }),
		});
	}

	return actions;
}

/**
 * Setting the status by hand is offered, and it is also not the truth.
 *
 * While the story is unlinked this is the only record there is; once a ticket
 * exists the ticketing system owns the answer and this changes only the board's
 * copy — which the label says, so nobody believes they have moved a ticket.
 *
 * The current status is filtered out: an item that does nothing is one more
 * thing to read past on a menu that already lists five.
 */
function statusActions(
	dispatch: (action: BoardAction) => void,
	current: StoryStatus,
	linked: boolean,
): CardMenuAction[] {
	return STORY_STATUSES.filter((candidate) => candidate !== current).map((candidate, position) => ({
		label: linked ? `Mark ${storyStatusLabel[candidate]} here only` : `Mark ${storyStatusLabel[candidate]}`,
		separated: position === 0,
		run: () => dispatch({ type: 'setStoryStatus', status: candidate }),
	}));
}

function Add({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
	return (
		<button
			type="button"
			onClick={onClick}
			aria-label={label}
			className="rounded-md border border-transparent px-1.5 py-[0.15em] text-[0.7em] text-ink-muted hover:border-slate-300 hover:text-brand focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-sky-400"
		>
			+ {children}
		</button>
	);
}

/* -------------------------------------------------------------------------- */
/* Menus — the keyboard path                                                   */
/* -------------------------------------------------------------------------- */

function addNote(
	dispatch: (action: BoardAction) => void,
	kind: 'rule' | 'example' | 'question',
	id: Id,
	notes: readonly string[],
): CardMenuAction {
	return {
		label: 'Add a note',
		run: () =>
			dispatch({
				type: 'setNotes',
				kind,
				id,
				text: notes.length > 0 ? `${notes.join('\n\n')}\n\nNew note` : 'New note',
			}),
	};
}

/**
 * An example's menu: one entry per clause, plus the usual note and delete.
 *
 * The entries say "Add another Given" once a clause has something in it, because
 * that is what the line will read as — `And`. Naming it after the keyword it
 * produces would be shorter and would teach the wrong thing: there is no `And`
 * step, only a second `Given`.
 */
function exampleMenu(
	board: BoardState,
	dispatch: (action: BoardAction) => void,
	id: Id,
	example: Example,
	cell: string,
): CardMenuAction[] {
	const clause = (name: StepClause): CardMenuAction => {
		const written = example[name].filter((step) => step.trim() !== '').length;
		const waiting = example[name].at(-1)?.trim() === '';
		return {
			label: written === 0 ? `Add a ${clauseKeyword[name]}` : `Add another ${clauseKeyword[name]}`,
			run: waiting ? undefined : () => dispatch({ type: 'addStep', exampleId: id, clause: name }),
			disabledReason: waiting ? `There is already an empty ${clauseKeyword[name]} waiting.` : undefined,
		};
	};

	return [
		...STEP_CLAUSES.map(clause),
		addNote(dispatch, 'example', id, example.notes),
		...scheduleActions(board, dispatch, id, cell),
		{
			label: 'Delete this example',
			separated: true,
			run: () => dispatch({ type: 'remove', kind: 'example', id }),
		},
	];
}

/**
 * Move this example to another band, without a mouse.
 *
 * Drag is never the only way to do anything on this board, and scheduling is the
 * one operation where that matters most: a plan is edited far more often than it
 * is drawn, frequently by somebody reading it back rather than the person who
 * made it.
 *
 * The band it is already in is left out — an item that does nothing is one more
 * thing to read past.
 */
function scheduleActions(
	board: BoardState,
	dispatch: (action: BoardAction) => void,
	id: Id,
	cell: string,
): CardMenuAction[] {
	const { ruleId, band } = splitCellKey(cell);
	return bands(board)
		.filter((candidate) => candidate !== band)
		.map((candidate, position) => ({
			label:
				candidate === UNSCHEDULED
					? 'Move below the line'
					: `Deliver in ${board.deliveries[candidate]?.title ?? 'it'}`,
			separated: position === 0,
			run: () =>
				dispatch({
					type: 'moveExample',
					exampleId: id,
					from: cell,
					to: cellKey(ruleId, candidate),
					index: examplesIn(board, ruleId, candidate).length,
				}),
		}));
}

/** A question's menu. Examples have their own — see `exampleMenu`. */
function cardMenu(
	dispatch: (action: BoardAction) => void,
	kind: 'question',
	id: Id,
	notes: readonly string[],
): CardMenuAction[] {
	return [
		addNote(dispatch, kind, id, notes),
		{
			label: `Delete this ${cardLabel[kind].toLowerCase()}`,
			separated: true,
			run: () => dispatch({ type: 'remove', kind, id }),
		},
	];
}

function ruleMenu(
	board: BoardState,
	dispatch: (action: BoardAction) => void,
	id: Id,
	index: number,
): CardMenuAction[] {
	const last = board.ruleOrder.length - 1;
	const rule = board.rules[id];
	return [
		{
			label: 'Move left',
			run: index > 0 ? () => dispatch({ type: 'moveRule', ruleId: id, index: index - 1 }) : undefined,
			disabledReason: index > 0 ? undefined : 'It is already first.',
		},
		{
			label: 'Move right',
			run: index < last ? () => dispatch({ type: 'moveRule', ruleId: id, index: index + 1 }) : undefined,
			disabledReason: index < last ? undefined : 'It is already last.',
		},
		{
			// Below the line, because an example that has just been thought of has
			// not been planned into anything. The cell `+` buttons are how one is
			// created already scheduled.
			label: 'Add an example',
			separated: true,
			run: () => dispatch({ type: 'addExample', ruleId: id, band: UNSCHEDULED }),
		},
		{ label: 'Ask a question about it', run: () => dispatch({ type: 'addQuestion', parent: { ruleId: id } }) },
		addNote(dispatch, 'rule', id, rule?.notes ?? []),
		{ label: 'Add a rule after it', separated: true, run: () => dispatch({ type: 'addRule', index: index + 1 }) },
		{
			label: 'Delete the rule and its cards',
			separated: true,
			run: () => dispatch({ type: 'remove', kind: 'rule', id }),
		},
	];
}
