/**
 * The board itself: one CSS grid, everything placed explicitly.
 *
 * ## Why one grid and not nested rows
 *
 * A step column has to line up across every band. Nested per-band flex rows
 * cannot do that without fixed pixel widths, so the whole board — the activity
 * backbone, the step headers, the sticky band rail and every cell — is a single
 * grid, and each child names its own `gridColumn` and `gridRow`.
 *
 * ## Why the track template is an inline style
 *
 * doc-portal's src/components/home/SectionPanels.astro documents the trap:
 * Tailwind scans source text for class names and cannot see one assembled at
 * runtime, so `grid-cols-${n}` emits no CSS and the grid silently collapses to
 * one column. A story map's column count only exists at runtime, so the track
 * template cannot be a class at all. An inline style is not a class, so the
 * static scan is simply not involved.
 *
 * The same rule governs the card colours, which is why src/lib/board/kinds.ts
 * writes all three class strings out in full instead of interpolating the kind.
 */

import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { useMemo } from 'react';
import { canChangeKind, type BoardAction } from '../../lib/board/reducer.ts';
import {
	bandOrder,
	cellKey,
	columnGeometry,
	storiesIn,
	UNASSIGNED,
	type BandId,
	type BoardState,
	type Id,
} from '../../lib/board/state.ts';
import { kindLabel } from '../../lib/board/kinds.ts';
import { BandRail } from './BandRail.tsx';
import { Card } from './Card.tsx';
import type { CardMenuAction } from './CardMenu.tsx';
import { Cell } from './Cell.tsx';

/** Width of the sticky band rail. A rem value so it tracks the root font size. */
const RAIL = '11rem';
/** Minimum readable width for a step column before the board starts scrolling. */
const COLUMN = '13rem';

/** Grid rows 1 and 2 are the two header rows; bands start at 3. */
const ACTIVITY_ROW = 1;
const STEP_ROW = 2;
const FIRST_BAND_ROW = 3;

export function BoardGrid({
	board,
	dispatch,
}: {
	board: BoardState;
	dispatch: (action: BoardAction) => void;
}) {
	const geometry = useMemo(() => columnGeometry(board), [board]);
	const bands = bandOrder(board);

	const bandName = (band: BandId): string =>
		band === UNASSIGNED ? 'Below the line' : board.releases[band]?.title ?? 'Unknown';

	return (
		<div
			className="board-scroll relative rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-night-raised"
			// A bounded height is what gives `position: sticky` a scroll container
			// to stick within. Without it the rail and the header rows stick to the
			// page, which on a long board is not what anyone means.
			style={{ maxHeight: '75vh' }}
		>
			<div
				className="grid min-w-max gap-2"
				style={{ gridTemplateColumns: `${RAIL} repeat(${geometry.columnCount}, minmax(${COLUMN}, 1fr))` }}
			>
				{/* Top-left corner. Sticks in both directions, so it must outrank
				    both the rail and the header rows. */}
				<div
					style={{ gridColumn: 1, gridRow: `${ACTIVITY_ROW} / span 2` }}
					className="sticky top-0 left-0 z-30 rounded-lg bg-white px-2 py-1 text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase dark:bg-night-raised dark:text-slate-400"
				>
					Releases
				</div>

				{/* ---- the backbone ---- */}
				<SortableContext items={[...board.activityOrder]} strategy={horizontalListSortingStrategy}>
					{board.activityOrder.map((activityId, index) => {
						const activity = board.activities[activityId];
						const span = geometry.spans.get(activityId);
						if (!activity || !span) return null;
						return (
							<Card
								key={activityId}
								id={activityId}
								kind="activity"
								title={activity.title}
								notes={activity.notes}
								position={`activity ${index + 1} of ${board.activityOrder.length}`}
								data={{ type: 'activity' }}
								onRetitle={(title) => dispatch({ type: 'retitle', kind: 'activity', id: activityId, title })}
								menu={cardMenu(board, dispatch, 'activity', activityId, index)}
								className="sticky top-0 z-10"
								style={{ gridColumn: `${span.start + 2} / span ${span.width}`, gridRow: ACTIVITY_ROW }}
							/>
						);
					})}
				</SortableContext>

				{/* ---- the narrative flow ---- */}
				{board.activityOrder.map((activityId) => {
					const activity = board.activities[activityId];
					if (!activity) return null;
					return (
						<SortableContext
							key={`steps-${activityId}`}
							items={[...activity.stepOrder]}
							strategy={horizontalListSortingStrategy}
						>
							{activity.stepOrder.map((stepId, index) => {
								const step = board.steps[stepId];
								const column = geometry.columnOfStep.get(stepId);
								if (!step || column === undefined) return null;
								return (
									<Card
										key={stepId}
										id={stepId}
										kind="step"
										title={step.title}
										notes={step.notes}
										position={`step ${index + 1} of ${activity.stepOrder.length} in ${activity.title}`}
										data={{ type: 'step', activityId }}
										onRetitle={(title) => dispatch({ type: 'retitle', kind: 'step', id: stepId, title })}
										menu={cardMenu(board, dispatch, 'step', stepId, index, activityId)}
										className="sticky top-9 z-10"
										style={{ gridColumn: column + 2, gridRow: STEP_ROW }}
									/>
								);
							})}
						</SortableContext>
					);
				})}

				{/* An activity with no steps still owns a column — that is what the
				    max(1, …) in columnGeometry() is for — and this is what stands in
				    it, so a newly added activity is not a dead end. */}
				{board.activityOrder.map((activityId) => {
					const activity = board.activities[activityId];
					const span = geometry.spans.get(activityId);
					if (!activity || !span || activity.stepOrder.length > 0) return null;
					return (
						<button
							key={`empty-${activityId}`}
							type="button"
							onClick={() => dispatch({ type: 'addStep', activityId, index: 0 })}
							style={{ gridColumn: span.start + 2, gridRow: STEP_ROW }}
							className="rounded-lg border border-dashed border-slate-300 px-2 py-2 text-xs text-ink-muted hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand dark:border-slate-600 dark:text-slate-400 dark:hover:border-sky-400 dark:hover:text-sky-400"
						>
							+ Step
						</button>
					);
				})}

				{/* ---- the bands ---- */}
				<BandRail board={board} dispatch={dispatch} firstRow={FIRST_BAND_ROW} />

				{bands.map((band, bandIndex) =>
					board.activityOrder.flatMap((activityId) => {
						const activity = board.activities[activityId];
						if (!activity) return [];
						return activity.stepOrder.flatMap((stepId) => {
							const step = board.steps[stepId];
							const column = geometry.columnOfStep.get(stepId);
							if (!step || column === undefined) return [];
							const key = cellKey(stepId, band);
							const ids = storiesIn(board, stepId, band);
							const label = `${step.title}, ${bandName(band)}`;
							return [
								<Cell
									key={key}
									cell={key}
									label={label}
									storyIds={ids}
									onAdd={() => dispatch({ type: 'addStory', cell: key, index: ids.length })}
									style={{ gridColumn: column + 2, gridRow: FIRST_BAND_ROW + bandIndex }}
								>
									{ids.map((storyId, index) => {
										const story = board.stories[storyId];
										if (!story) return null;
										return (
											<li key={storyId}>
												<Card
													id={storyId}
													kind="story"
													title={story.title}
													notes={story.notes}
													position={`in ${label}, ${index + 1} of ${ids.length}`}
													data={{ type: 'story', cell: key }}
													onRetitle={(title) => dispatch({ type: 'retitle', kind: 'story', id: storyId, title })}
													menu={storyMenu(board, dispatch, storyId, key, index, ids.length)}
												/>
											</li>
										);
									})}
								</Cell>,
							];
						});
					}),
				)}
			</div>
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/* Menus — the keyboard path                                                   */
/* -------------------------------------------------------------------------- */

function kindChangeActions(
	board: BoardState,
	dispatch: (action: BoardAction) => void,
	kind: 'activity' | 'step' | 'story',
	id: Id,
): CardMenuAction[] {
	return (['activity', 'step', 'story'] as const)
		.filter((to) => to !== kind)
		.map((to, index) => {
			const verdict = canChangeKind(board, kind, id, to);
			return {
				label: `Make it a ${kindLabel[to].toLowerCase()}`,
				separated: index === 0,
				run: verdict.ok ? () => dispatch({ type: 'changeKind', kind, id, to }) : undefined,
				disabledReason: verdict.ok ? undefined : verdict.reason,
			};
		});
}

function cardMenu(
	board: BoardState,
	dispatch: (action: BoardAction) => void,
	kind: 'activity' | 'step',
	id: Id,
	index: number,
	activityId?: Id,
): CardMenuAction[] {
	const siblings =
		kind === 'activity' ? board.activityOrder : (activityId ? board.activities[activityId]?.stepOrder ?? [] : []);

	const move = (to: number): (() => void) | undefined => {
		if (to < 0 || to > siblings.length - 1) return undefined;
		if (kind === 'activity') return () => dispatch({ type: 'moveActivity', activityId: id, index: to });
		if (!activityId) return undefined;
		return () => dispatch({ type: 'moveStep', stepId: id, fromActivityId: activityId, toActivityId: activityId, index: to });
	};

	const left = move(index - 1);
	const right = move(index + 1);

	return [
		{ label: 'Move left', run: left, disabledReason: left ? undefined : 'It is already first.' },
		{ label: 'Move right', run: right, disabledReason: right ? undefined : 'It is already last.' },
		...kindChangeActions(board, dispatch, kind, id),
		{
			label: kind === 'activity' ? 'Delete activity and its steps' : 'Delete step and its stories',
			separated: true,
			run: () => dispatch({ type: 'removeCard', kind, id }),
		},
	];
}

function storyMenu(
	board: BoardState,
	dispatch: (action: BoardAction) => void,
	storyId: Id,
	from: string,
	index: number,
	total: number,
): CardMenuAction[] {
	const separator = from.indexOf('|');
	const stepId = from.slice(0, separator);
	const band = from.slice(separator + 1);

	const up = index > 0 ? () => dispatch({ type: 'moveStory', storyId, from, to: from, index: index - 1 }) : undefined;
	const down =
		index < total - 1 ? () => dispatch({ type: 'moveStory', storyId, from, to: from, index: index + 1 }) : undefined;

	// One entry per band the story is not already in. This is the whole reason a
	// menu exists rather than drag alone: moving a card five bands down on a
	// scrolling board is a menu click and a very long drag.
	const bandMoves: CardMenuAction[] = bandOrder(board)
		.filter((other) => other !== band)
		.map((other, position) => ({
			label: `Move to ${other === UNASSIGNED ? 'below the line' : board.releases[other]?.title ?? 'unknown'}`,
			separated: position === 0,
			run: () =>
				dispatch({
					type: 'moveStory',
					storyId,
					from,
					to: cellKey(stepId, other),
					index: storiesIn(board, stepId, other).length,
				}),
		}));

	return [
		{ label: 'Move up', run: up, disabledReason: up ? undefined : 'It is already at the top.' },
		{ label: 'Move down', run: down, disabledReason: down ? undefined : 'It is already at the bottom.' },
		...bandMoves,
		...kindChangeActions(board, dispatch, 'story', storyId),
		{ label: 'Delete story', separated: true, run: () => dispatch({ type: 'removeCard', kind: 'story', id: storyId }) },
	];
}
