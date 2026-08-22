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
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { canChangeKind, personasFor, type BoardAction } from '../../lib/board/reducer.ts';
import {
	bandOrder,
	cellKey,
	columnGeometry,
	storiesIn,
	UNASSIGNED,
	type BandId,
	type BoardState,
	type CardKind,
	type Id,
} from '../../lib/board/state.ts';
import { kindLabel } from '../../lib/board/kinds.ts';
import {
	STORY_STATUSES,
	storyStatusLabel,
	ticketKindOf,
	type StoryStatus,
} from '../../lib/storymap/model.ts';
import { activityDerived, stepDerived } from '../../lib/board/detail.ts';
import { StoryNeed } from './StoryNeed.tsx';
import { BandRail } from './BandRail.tsx';
import { StoryMeta } from './StoryMeta.tsx';
import { Icon } from './Icon.tsx';
import { Card } from './Card.tsx';
import type { CardMenuAction } from './CardMenu.tsx';
import { Cell } from './Cell.tsx';

/*
 * Track widths in `em`, against the font-size the scroll container gets from the
 * zoom level. One number therefore moves the whole board — columns, cards,
 * padding and text together — without a `transform`, which would break the
 * sticky header rows and confuse dnd-kit's hit-testing.
 *
 * The column is narrow on purpose. A story map is read *across*: the useful
 * question is how many steps fit on screen, and every rem of card width costs
 * one. Titles and notes wrap to as many lines as they need instead, which trades
 * vertical space that is cheap for horizontal space that is not.
 */
const RAIL = '8.5em';
const COLUMN = '10em';
/**
 * Font-size at 100%, in px. Everything on the board is `em` against this.
 *
 * 20.8 rather than 13, which is where this started: the old scale ran 60%-160%
 * around a 13px base, and 100% of it was too small to read comfortably. What
 * used to be its top stop is now the bottom of the range and the default, so
 * "100%" means the size the board is actually usable at.
 *
 * Exported because the DragOverlay in StoryMapBoard has to size the card it
 * draws to match the board underneath it. It used to repeat the number, which
 * worked only for as long as nobody changed one of them.
 */
export const BASE_FONT = 20.8;

/** Grid rows 1 and 2 are the two header rows; bands start at 3. */
const ACTIVITY_ROW = 1;
const STEP_ROW = 2;
const FIRST_BAND_ROW = 3;

export function BoardGrid({
	board,
	dispatch,
	onLinkTicket,
	onCreateTicket,
	ticketingConfigured,
	zoom,
	fullscreen,
	expanded,
	onToggleDetail,
}: {
	board: BoardState;
	dispatch: (action: BoardAction) => void;
	/** Prompt for a ticket id and link it, or clear the link. */
	onLinkTicket: (kind: CardKind, id: Id) => void;
	/** Ask the ticketing system for a new ticket — an epic for a step. */
	onCreateTicket: (kind: CardKind, id: Id) => void;
	ticketingConfigured: boolean;
	/** 1 is 100%. Scales the whole board; see the note on RAIL above. */
	zoom: number;
	fullscreen: boolean;
	/** Cards whose detail is open. Everything not in here is collapsed. */
	expanded: ReadonlySet<Id>;
	onToggleDetail: (id: Id) => void;
}) {
	const geometry = useMemo(() => columnGeometry(board), [board]);
	const bands = bandOrder(board);

	/*
	 * Both header rows stay put while the bands scroll under them.
	 *
	 * The activity row sticks at 0 and the step row sticks directly below it —
	 * but "directly below" is a pixel count nobody can write down. It was a
	 * hard-coded `2.6em`, which was right until activity cards grew a ticket and
	 * status line and became taller than the guess; the step row then stuck
	 * *behind* the activity row and looked like it was not sticking at all.
	 *
	 * So it is measured. The grid's resolved `gridTemplateRows` gives the used
	 * height of row one, which is exactly what the offset is, and a
	 * ResizeObserver keeps it right through zooming, expanding a card's detail,
	 * and anything else that changes the backbone's height.
	 */
	const grid = useRef<HTMLDivElement>(null);
	const [stepTop, setStepTop] = useState(0);

	useLayoutEffect(() => {
		const element = grid.current;
		if (!element) return;

		const measure = () => {
			const style = getComputedStyle(element);
			const first = Number.parseFloat(style.gridTemplateRows.split(' ')[0] ?? '');
			const gap = Number.parseFloat(style.rowGap) || 0;
			if (Number.isFinite(first)) setStepTop(first + gap);
		};

		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	const bandName = (band: BandId): string =>
		band === UNASSIGNED ? 'Below the line' : board.releases[band]?.title ?? 'Unknown';

	return (
		<div
			className={`board-scroll relative border border-slate-200 bg-white dark:border-slate-700 dark:bg-night-raised ${
				fullscreen ? 'min-h-0 flex-1 rounded-xl p-3' : 'rounded-2xl p-3'
			}`}
			style={{
				// A bounded height is what gives `position: sticky` a scroll
				// container to stick within. Without it the rail and the header rows
				// stick to the page, which on a long board is not what anyone means.
				// In fullscreen the wrapper is already the viewport, so the board
				// takes all of it.
				maxHeight: fullscreen ? '100%' : '75vh',
				// The one number the whole board is measured against.
				fontSize: `${BASE_FONT * zoom}px`,
			}}
		>
			<div
				ref={grid}
				className="grid min-w-max gap-[0.4em]"
				style={{ gridTemplateColumns: `${RAIL} repeat(${geometry.columnCount}, minmax(${COLUMN}, 1fr))` }}
			>
				{/*
				    An opaque band behind both header rows.

				    The cards are opaque but the grid's gaps are not, so without this
				    the stories scrolling underneath show through the seams between
				    the header cards — a flicker of cards inside the backbone, which
				    reads as a rendering fault rather than as scrolling.

				    Spans both rows and every column, sticks at the top with the
				    activity row, and sits at z-5: above the cells, below the header
				    cards themselves.
				*/}
				<div
					aria-hidden="true"
					style={{ gridColumn: '1 / -1', gridRow: `${ACTIVITY_ROW} / span 2` }}
					className="sticky top-0 z-[5] -m-[0.2em] bg-white dark:bg-night-raised"
				/>

				{/* Top-left corner. Sticks in both directions, so it must outrank
				    both the rail and the header rows. */}
				<div
					style={{ gridColumn: 1, gridRow: `${ACTIVITY_ROW} / span 2` }}
					className="sticky top-0 left-0 z-30 rounded-[0.4em] bg-white px-[0.5em] py-[0.25em] text-[0.7em] font-semibold tracking-[0.14em] text-ink-muted uppercase dark:bg-night-raised dark:text-slate-400"
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
								derived={activityDerived(activity)}
								notes={activity.notes}
								onNotes={(text) => dispatch({ type: 'setNotes', kind: 'activity', id: activityId, text })}
								meta={
									<StoryMeta
										ticket={activity.ticket}
										status={activity.status}
										onEditTicket={() => onLinkTicket('activity', activityId)}
									/>
								}
								detailOpen={expanded.has(activityId)}
								onToggleDetail={() => onToggleDetail(activityId)}
								detailLabel="cast"
								position={`activity ${index + 1} of ${board.activityOrder.length}${
									activity.personas.length > 0 ? `, for ${activity.personas.join(', ')}` : ''
								}`}
								data={{ type: 'activity' }}
								onRetitle={(title) => dispatch({ type: 'retitle', kind: 'activity', id: activityId, title })}
								menu={cardMenu(board, dispatch, 'activity', activityId, index, undefined, {
									onLinkTicket,
									onCreateTicket,
									ticketingConfigured,
								})}
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
										derived={stepDerived(step)}
									notes={step.notes}
									onNotes={(text) => dispatch({ type: 'setNotes', kind: 'step', id: stepId, text })}
									meta={
										<StoryMeta
											ticket={step.ticket}
											status={step.status}
											onEditTicket={() => onLinkTicket('step', stepId)}
										/>
									}
									detailOpen={expanded.has(stepId)}
									onToggleDetail={() => onToggleDetail(stepId)}
									detailLabel="notes"
										position={`step ${index + 1} of ${activity.stepOrder.length} in ${activity.title}`}
										data={{ type: 'step', activityId }}
										onRetitle={(title) => dispatch({ type: 'retitle', kind: 'step', id: stepId, title })}
										menu={cardMenu(board, dispatch, 'step', stepId, index, activityId, {
										onLinkTicket,
										onCreateTicket,
										ticketingConfigured,
									})}
										className="sticky z-10"
										style={{ gridColumn: column + 2, gridRow: STEP_ROW, top: stepTop }}
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
							aria-label={`Add the first step to ${activity.title}`}
							style={{ gridColumn: span.start + 2, gridRow: STEP_ROW }}
							className="flex items-center justify-center rounded-[0.4em] border border-dashed border-slate-300 px-2 py-[0.4em] text-ink-muted hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand dark:border-slate-600 dark:text-slate-400 dark:hover:border-sky-400 dark:hover:text-sky-400"
						>
							<Icon name="plus" className="h-[1em] w-[1em]" />
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
													derived={[]}
											detailContent={
												<StoryNeed
													story={story}
													personas={personasFor(board, storyId)}
													onPersona={(persona) => dispatch({ type: 'setPersona', id: storyId, persona })}
													onClause={(field, text) => dispatch({ type: 'setNeed', id: storyId, field, text })}
												/>
											}
											notes={story.notes}
											onNotes={(text) => dispatch({ type: 'setNotes', kind: 'story', id: storyId, text })}
											detailOpen={expanded.has(storyId)}
											onToggleDetail={() => onToggleDetail(storyId)}
											detailLabel="need"
													position={`in ${label}, ${index + 1} of ${ids.length}`}
													data={{ type: 'story', cell: key }}
													onRetitle={(title) => dispatch({ type: 'retitle', kind: 'story', id: storyId, title })}
													meta={
														<StoryMeta
															ticket={story.ticket}
															status={story.status}
															onEditTicket={() => onLinkTicket('story', storyId)}
														/>
													}
													menu={storyMenu(board, dispatch, storyId, key, index, ids.length, {
														onLinkTicket,
														onCreateTicket,
														ticketingConfigured,
													})}
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

/**
 * "Add a note", for a card that has none.
 *
 * A card with nothing written shows no caret — the caret means "there is more
 * here", and one on an empty card would be a promise of nothing. So the menu is
 * the way in, and it seeds a placeholder the same way a new card does, which
 * makes the caret appear and the text clickable.
 */
/**
 * Setting a status by hand is offered, and it is also not the truth.
 *
 * While a card is unlinked this is the only record there is; once a ticket
 * exists the ticketing system owns the answer and this changes only the board's
 * copy — which the label says, so nobody believes they have moved a ticket.
 */
function statusActions(
	dispatch: (action: BoardAction) => void,
	kind: CardKind,
	id: Id,
	current: StoryStatus | undefined,
	linked: boolean,
): CardMenuAction[] {
	return STORY_STATUSES.filter((candidate) => candidate !== current).map((candidate, position) => ({
		label: linked ? `Mark ${storyStatusLabel[candidate]} here only` : `Mark ${storyStatusLabel[candidate]}`,
		separated: position === 0,
		run: () => dispatch({ type: 'setStatus', kind, id, status: candidate }),
	}));
}

/**
 * An activity raises a capability, a step an epic, a story a story.
 *
 * The wording follows the row, because "create a ticket" on a backbone card is
 * true and useless — the reader wants to know what will appear in the tracker.
 */
function ticketActions(
	dispatch: (action: BoardAction) => void,
	kind: CardKind,
	id: Id,
	ticket: string | null,
	ticketing: {
		onLinkTicket: (kind: CardKind, id: Id) => void;
		onCreateTicket: (kind: CardKind, id: Id) => void;
		ticketingConfigured: boolean;
	},
): CardMenuAction[] {
	const noun = ticketKindOf[kind];
	const article = noun === 'epic' ? 'an' : 'a';
	if (ticket !== null) {
		return [
			{ label: `Change the ${noun} id…`, separated: true, run: () => ticketing.onLinkTicket(kind, id) },
			{ label: `Unlink from its ${noun}`, run: () => dispatch({ type: 'setTicket', kind, id, ticket: null }) },
		];
	}
	return [
		{
			label: `Create ${article} ${noun}`,
			separated: true,
			run: ticketing.ticketingConfigured ? () => ticketing.onCreateTicket(kind, id) : undefined,
			disabledReason: ticketing.ticketingConfigured
				? undefined
				: 'No ticketing system is configured for doc-sm.',
		},
		{ label: `Link an existing ${noun}…`, run: () => ticketing.onLinkTicket(kind, id) },
	];
}

function addNoteAction(
	dispatch: (action: BoardAction) => void,
	kind: CardKind,
	id: Id,
	notes: readonly string[],
): CardMenuAction {
	return {
		label: 'Add a note',
		separated: true,
		run: () =>
			dispatch({
				type: 'setNotes',
				kind,
				id,
				text: notes.length > 0 ? `${notes.join('\n\n')}\n\nNew note` : 'New note',
			}),
	};
}

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
	activityId: Id | undefined,
	ticketing: {
		onLinkTicket: (kind: CardKind, id: Id) => void;
		onCreateTicket: (kind: CardKind, id: Id) => void;
		ticketingConfigured: boolean;
	},
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

	const notes = (kind === 'activity' ? board.activities[id]?.notes : board.steps[id]?.notes) ?? [];
	// Both kinds raise a ticket: an activity a capability, a step an epic.
	const card = kind === 'activity' ? board.activities[id] : board.steps[id];

	return [
		{ label: 'Move left', run: left, disabledReason: left ? undefined : 'It is already first.' },
		{ label: 'Move right', run: right, disabledReason: right ? undefined : 'It is already last.' },
		addNoteAction(dispatch, kind, id, notes),
		...(card ? statusActions(dispatch, kind, id, card.status, card.ticket !== null) : []),
		...(card ? ticketActions(dispatch, kind, id, card.ticket, ticketing) : []),
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
	ticketing: {
		onLinkTicket: (kind: CardKind, id: Id) => void;
		onCreateTicket: (kind: CardKind, id: Id) => void;
		ticketingConfigured: boolean;
	},
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

	const story = board.stories[storyId];
	const linked = story?.ticket != null;

	const statusMoves = statusActions(dispatch, 'story', storyId, story?.status, linked);
	const ticketMoves = ticketActions(dispatch, 'story', storyId, story?.ticket ?? null, ticketing);

	return [
		{ label: 'Move up', run: up, disabledReason: up ? undefined : 'It is already at the top.' },
		{ label: 'Move down', run: down, disabledReason: down ? undefined : 'It is already at the bottom.' },
		...bandMoves,
		...statusMoves,
		...ticketMoves,
		addNoteAction(dispatch, 'story', storyId, story?.notes ?? []),
		...kindChangeActions(board, dispatch, 'story', storyId),
		{ label: 'Delete story', separated: true, run: () => dispatch({ type: 'removeCard', kind: 'story', id: storyId }) },
	];
}
