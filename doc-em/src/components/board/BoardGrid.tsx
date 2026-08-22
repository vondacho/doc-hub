/**
 * The board: the story across the top, the rules as columns beneath it.
 *
 * The layout is the technique's own, and the practice describes it as an
 * instruction rather than a suggestion — "write the story, write the rules under
 * it, under each rule write examples until everyone agrees the rule is
 * understood". So: one story spanning the width, its own questions beside it,
 * then a column per rule holding that rule's examples and then its questions.
 *
 * Simpler than doc-sm's grid, and for a real reason rather than by omission:
 * there is no second axis. A story map has releases crossing steps and needs a
 * two-dimensional cell; an example map has one story, and everything else hangs
 * off a rule.
 *
 * What is kept from doc-sm, deliberately: the em-based sizing so one font-size
 * scales the whole board, the sticky header that pins where it rests, the
 * padding living outside the scrollport, and the opaque band behind the header.
 * Those were all bought with real bugs; none of them is re-learned here.
 */

import { SortableContext, horizontalListSortingStrategy, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { cardLabel, clauseKeyword, STEP_CLAUSES, type StepClause } from '../../lib/examplemap/model.ts';
import type { BoardAction, QuestionParent } from '../../lib/board/reducer.ts';
import { STORY_DETAIL_KEY, type BoardState, type Example, type Id } from '../../lib/board/state.ts';
import { Card } from './Card.tsx';
import { ExampleSteps } from './ExampleSteps.tsx';
import type { CardMenuAction } from './CardMenu.tsx';
import { Icon } from './Icon.tsx';

/**
 * Track widths in `em`, against the font-size the scroll container gets from the
 * zoom level. One number moves the whole board — without a `transform`, which
 * would break the sticky header and confuse dnd-kit's hit-testing.
 */
const COLUMN = '13em';
/** Font-size at 100%, in px. Everything on the board is `em` against this. */
export const BASE_FONT = 20.8;

const STORY_ROW = 1;
const RULE_ROW = 2;
const CARDS_ROW = 3;

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

	const columns = Math.max(1, board.ruleOrder.length);

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
					style={{ gridTemplateColumns: `repeat(${columns}, minmax(${COLUMN}, 1fr))` }}
				>
					{/* Opaque behind the two header rows: the cards are opaque but the
					    grid's gaps are not. */}
					<div
						aria-hidden="true"
						style={{ gridColumn: '1 / -1', gridRow: `${STORY_ROW} / span 2` }}
						className="sticky top-0 z-[5] -mb-[0.2em] bg-white pb-[0.2em] dark:bg-night-raised"
					/>

					{/* ---- the story, and the doubts about the story ---- */}
					<div
						style={{ gridColumn: '1 / -1', gridRow: STORY_ROW }}
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
							]}
							className="min-w-[16em] flex-1"
						/>

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
									style={{ gridColumn: index + 1, gridRow: RULE_ROW, top: ruleTop }}
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
							style={{ gridColumn: 1, gridRow: RULE_ROW }}
							className="flex items-center justify-center rounded-[0.4em] border border-dashed border-slate-300 px-2 py-[0.4em] text-ink-muted hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand dark:border-slate-600 dark:text-slate-400 dark:hover:border-sky-400 dark:hover:text-sky-400"
						>
							<Icon name="plus" className="h-[1em] w-[1em]" />
						</button>
					)}

					{/* ---- the examples and questions under each rule ---- */}
					{board.ruleOrder.map((ruleId, index) => {
						const rule = board.rules[ruleId];
						if (!rule) return null;
						return (
							<RuleColumn
								key={`col-${ruleId}`}
								board={board}
								dispatch={dispatch}
								rule={ruleId}
								column={index + 1}
								expanded={expanded}
								onToggleDetail={onToggleDetail}
							/>
						);
					})}
				</div>
			</div>
		</div>
	);
}

/**
 * One rule's column: its examples, then its questions.
 *
 * Examples first because that is the order they are written, and because the
 * question is usually what stopped the examples. A rule showing questions and no
 * examples is the practice's own warning sign, and it should look like one.
 */
function RuleColumn({
	board,
	dispatch,
	rule: ruleId,
	column,
	expanded,
	onToggleDetail,
}: {
	board: BoardState;
	dispatch: (action: BoardAction) => void;
	rule: Id;
	column: number;
	expanded: ReadonlySet<Id>;
	onToggleDetail: (id: Id) => void;
}) {
	const rule = board.rules[ruleId];
	const { setNodeRef, isOver } = useDroppable({ id: `examples:${ruleId}`, data: { accepts: 'example', ruleId } });
	if (!rule) return null;

	return (
		<div
			ref={setNodeRef}
			style={{ gridColumn: column, gridRow: CARDS_ROW }}
			className={`group/col flex min-h-[4em] flex-col gap-[0.3em] rounded-[0.4em] border border-dashed p-[0.3em] transition-colors motion-reduce:transition-none ${
				isOver ? 'border-brand bg-brand/5 dark:border-sky-400 dark:bg-sky-400/10' : 'border-slate-200 dark:border-slate-700'
			}`}
		>
			<ul aria-label={`Examples for ${rule.title}`} className="flex flex-col gap-[0.3em]">
				<SortableContext items={[...rule.exampleIds]} strategy={verticalListSortingStrategy}>
					{rule.exampleIds.map((id, index) => {
						const card = board.examples[id];
						if (!card) return null;
						return (
							<li key={id}>
								<Card
									id={id}
									kind="example"
									title={card.title}
									notes={card.notes}
									position={`${index + 1} of ${rule.exampleIds.length} under "${rule.title}"`}
									data={{ type: 'example', ruleId }}
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
									menu={exampleMenu(dispatch, id, card)}
								/>
							</li>
						);
					})}
				</SortableContext>
			</ul>

			<QuestionStrip
				board={board}
				dispatch={dispatch}
				parent={{ ruleId }}
				ids={rule.questionIds}
				expanded={expanded}
				onToggleDetail={onToggleDetail}
				stacked
			/>

			<div className="flex gap-1 opacity-0 transition group-hover/col:opacity-100 focus-within:opacity-100 motion-reduce:transition-none">
				<Add label={`Add an example to ${rule.title}`} onClick={() => dispatch({ type: 'addExample', ruleId })}>
					Example
				</Add>
				<Add label={`Ask a question about ${rule.title}`} onClick={() => dispatch({ type: 'addQuestion', parent: { ruleId } })}>
					Question
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
	dispatch: (action: BoardAction) => void,
	id: Id,
	example: Example,
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
		{
			label: 'Delete this example',
			separated: true,
			run: () => dispatch({ type: 'remove', kind: 'example', id }),
		},
	];
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
		{ label: 'Add an example', separated: true, run: () => dispatch({ type: 'addExample', ruleId: id }) },
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
