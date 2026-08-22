/**
 * The wall: phases as columns, cards stacked in time order inside each.
 *
 * Time runs left to right, which is the one rule the practice states as an
 * instruction — "arrange all domain events on a single timeline from left to
 * right". A phase is a stretch of that line, and reading order is down a column
 * and then on to the next.
 *
 * Columns rather than one long row, which is what a physical wall actually is.
 * A row of sixty events is eight metres of paper in a room and a horizontal
 * scrollbar on a screen, and a screen has the vertical space a wall does not. So
 * the timeline is folded: across the phases, down within one. doc-sm and doc-em
 * fold the same way for the same reason, which also means all three boards read
 * alike.
 *
 * ## The empty board is a row of `+`
 *
 * A fresh storm is one unnamed phase holding nothing, and what it shows is one
 * dashed square per kind, each with a `+` and each tinted with that kind's own
 * colour. That is the legend and the first move in the same control: the five
 * colours *are* the notation, and somebody who has never seen the board learns
 * them by adding one.
 *
 * The strip stays at the foot of every phase for the whole life of the board.
 * On a wall you never run out of somewhere to stick a note, and a `+` that
 * appeared only on hover would hide the one thing a chaotic-exploration phase
 * does over and over.
 *
 * What is kept from doc-em, deliberately: the em-based sizing so one font-size
 * scales the whole board, the sticky header, the padding living outside the
 * scrollport. Those were bought with real bugs; none of them is re-learned here.
 */

import { SortableContext, horizontalListSortingStrategy, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { useLayoutEffect, useRef } from 'react';
import { CARD_KINDS, cardLabel, cardMeaning, type CardKind } from '../../lib/eventstorm/model.ts';
import { swatchClass } from '../../lib/board/kinds.ts';
import type { BoardAction } from '../../lib/board/reducer.ts';
import type { BoardState, Id } from '../../lib/board/state.ts';
import { Card } from './Card.tsx';
import type { CardMenuAction } from './CardMenu.tsx';
import { Icon } from './Icon.tsx';

/** One phase column. Wide enough for a sentence-length note at 100%. */
const COLUMN = '13em';

/** Font-size at 100%, in px. Everything on the board is `em` against this. */
export const BASE_FONT = 20.8;

const PHASE_ROW = 1;
const CARDS_ROW = 2;

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
	/** Changes on every import, so the scroller can go back to the start. */
	documentKey: number;
	expanded: ReadonlySet<Id>;
	onToggleDetail: (id: Id) => void;
}) {
	const scroller = useRef<HTMLDivElement>(null);

	// A new document is a new wall; leaving the scroll where the last one ended
	// puts the visitor in the middle of something they have not seen.
	useLayoutEffect(() => {
		scroller.current?.scrollTo({ left: 0, top: 0 });
	}, [documentKey]);

	const columns = Math.max(1, board.phaseOrder.length);

	return (
		<div
			className={`relative border border-slate-200 bg-white dark:border-slate-700 dark:bg-night-raised ${
				fullscreen ? 'flex min-h-0 flex-1 flex-col rounded-xl p-4' : 'rounded-2xl p-3'
			}`}
		>
			{/* The padding is out here, so nothing scrolls through a strip the
			    sticky row cannot reach. */}
			<div
				ref={scroller}
				className={`board-scroll ${fullscreen ? 'min-h-0 flex-1' : ''}`}
				style={{ maxHeight: fullscreen ? '100%' : '75vh', fontSize: `${BASE_FONT * zoom}px` }}
			>
				<div
					className="grid min-w-max gap-[0.4em]"
					style={{ gridTemplateColumns: `repeat(${columns}, minmax(${COLUMN}, 1fr))` }}
				>
					{/* Opaque behind the header row: the headers are opaque but the
					    grid's gaps are not. */}
					<div
						aria-hidden="true"
						style={{ gridColumn: '1 / -1', gridRow: PHASE_ROW }}
						className="sticky top-0 z-[5] -mb-[0.2em] bg-white pb-[0.2em] dark:bg-night-raised"
					/>

					<SortableContext items={[...board.phaseOrder]} strategy={horizontalListSortingStrategy}>
						{board.phaseOrder.map((phaseId, index) => {
							const phase = board.phases[phaseId];
							if (!phase) return null;
							return (
								<PhaseHeader
									key={phaseId}
									board={board}
									dispatch={dispatch}
									phaseId={phaseId}
									index={index}
									column={index + 1}
									expanded={expanded}
									onToggleDetail={onToggleDetail}
								/>
							);
						})}
					</SortableContext>

					{board.phaseOrder.map((phaseId, index) => (
						<PhaseColumn
							key={`col-${phaseId}`}
							board={board}
							dispatch={dispatch}
							phaseId={phaseId}
							column={index + 1}
							expanded={expanded}
							onToggleDetail={onToggleDetail}
						/>
					))}
				</div>
			</div>
		</div>
	);
}

/**
 * A phase's header: its name, its notes, and the moves that apply to it.
 *
 * Sticky, so the name of the stretch you are reading stays visible while its
 * cards scroll past. It is not a sticky note itself — a phase is a boundary
 * somebody drew on the wall, not something written on one — so it is plain
 * rather than tinted.
 */
function PhaseHeader({
	board,
	dispatch,
	phaseId,
	index,
	column,
	expanded,
	onToggleDetail,
}: {
	board: BoardState;
	dispatch: (action: BoardAction) => void;
	phaseId: Id;
	index: number;
	column: number;
	expanded: ReadonlySet<Id>;
	onToggleDetail: (id: Id) => void;
}) {
	const phase = board.phases[phaseId];
	if (!phase) return null;
	const last = board.phaseOrder.length - 1;

	return (
		<div
			style={{ gridColumn: column, gridRow: PHASE_ROW }}
			className="sticky top-0 z-10 rounded-[0.4em] border border-slate-300 bg-white px-[0.5em] py-[0.4em] dark:border-slate-600 dark:bg-night-raised"
		>
			<Card
				id={phaseId}
				kind="phase"
				title={phase.title}
				notes={phase.notes}
				fixed
				data={{ type: 'phase' }}
				detailOpen={expanded.has(phaseId)}
				onToggleDetail={() => onToggleDetail(phaseId)}
				onRetitle={(title) => dispatch({ type: 'retitlePhase', id: phaseId, title })}
				onNotes={(text) => dispatch({ type: 'setPhaseNotes', id: phaseId, text })}
				position={`phase ${index + 1} of ${board.phaseOrder.length}`}
				menu={phaseMenu(board, dispatch, phaseId, index, last)}
				bare
			/>
		</div>
	);
}

function PhaseColumn({
	board,
	dispatch,
	phaseId,
	column,
	expanded,
	onToggleDetail,
}: {
	board: BoardState;
	dispatch: (action: BoardAction) => void;
	phaseId: Id;
	column: number;
	expanded: ReadonlySet<Id>;
	onToggleDetail: (id: Id) => void;
}) {
	const phase = board.phases[phaseId];
	const { setNodeRef, isOver } = useDroppable({ id: `phase:${phaseId}`, data: { accepts: 'card', phaseId } });
	if (!phase) return null;

	return (
		<div
			ref={setNodeRef}
			style={{ gridColumn: column, gridRow: CARDS_ROW }}
			className={`flex min-h-[6em] flex-col gap-[0.3em] rounded-[0.4em] border border-dashed p-[0.3em] transition-colors motion-reduce:transition-none ${
				isOver
					? 'border-brand bg-brand/5 dark:border-sky-400 dark:bg-sky-400/10'
					: 'border-slate-200 dark:border-slate-700'
			}`}
		>
			<ul aria-label={`Cards in ${phase.title}`} className="flex flex-col gap-[0.3em]">
				<SortableContext items={[...phase.cardIds]} strategy={verticalListSortingStrategy}>
					{phase.cardIds.map((id, index) => {
						const card = board.cards[id];
						if (!card) return null;
						return (
							<li key={id}>
								<Card
									id={id}
									kind={card.kind}
									title={card.title}
									notes={card.notes}
									position={`${index + 1} of ${phase.cardIds.length} in "${phase.title}"`}
									data={{ type: 'card', phaseId }}
									detailOpen={expanded.has(id)}
									onToggleDetail={() => onToggleDetail(id)}
									onRetitle={(title) => dispatch({ type: 'retitleCard', id, title })}
									onNotes={(text) => dispatch({ type: 'setCardNotes', id, text })}
									menu={cardMenu(board, dispatch, id, card.kind)}
								/>
							</li>
						);
					})}
				</SortableContext>
			</ul>

			<AddStrip phase={phase.title} onAdd={(kind) => dispatch({ type: 'addCard', phaseId, kind })} />
		</div>
	);
}

/**
 * One dashed square per kind, each with a `+`, tinted with that kind's colour.
 *
 * The legend and the first move in one control — see the note at the top of this
 * file. Always present, never on hover: adding a note is what this board is for,
 * and a control that hides itself makes the commonest action the hardest to
 * find.
 *
 * The label names the kind in words, because colour is never the only signal
 * here and a row of five coloured squares would otherwise be five identical
 * buttons to anybody who is not looking at hue.
 */
function AddStrip({ phase, onAdd }: { phase: string; onAdd: (kind: CardKind) => void }) {
	return (
		<div className="mt-[0.1em] flex flex-wrap gap-[0.25em]">
			{CARD_KINDS.map((kind) => (
				<button
					key={kind}
					type="button"
					onClick={() => onAdd(kind)}
					title={`${cardLabel[kind]} — ${cardMeaning[kind]}`}
					aria-label={`Add ${cardLabel[kind].toLowerCase()} to ${phase}`}
					className={`flex h-[1.7em] w-[1.7em] items-center justify-center rounded-[0.25em] border border-dashed opacity-70 transition hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand motion-reduce:transition-none ${swatchClass[kind]}`}
				>
					<Icon name="plus" className="h-[0.9em] w-[0.9em]" />
				</button>
			))}
		</div>
	);
}

/**
 * Re-colouring a card is offered, and it is the commonest correction there is.
 *
 * Half of what a wall does in its second hour is discovering that a note is the
 * wrong colour — an "event" that is really a hotspot, a "system" that is really
 * an actor. On paper you rewrite it on a different sticky; here it is one click,
 * and the card keeps its words and its place.
 */
function cardMenu(
	board: BoardState,
	dispatch: (action: BoardAction) => void,
	id: Id,
	current: CardKind,
): CardMenuAction[] {
	const card = board.cards[id];
	return [
		{
			label: 'Add a note',
			run: () =>
				dispatch({
					type: 'setCardNotes',
					id,
					text: card && card.notes.length > 0 ? `${card.notes.join('\n\n')}\n\nNew note` : 'New note',
				}),
		},
		...CARD_KINDS.filter((kind) => kind !== current).map((kind, position) => ({
			label: `Make it ${cardLabel[kind].toLowerCase()}`,
			separated: position === 0,
			run: () => dispatch({ type: 'setCardKind', id, kind }),
		})),
		{ label: 'Delete this card', separated: true, run: () => dispatch({ type: 'removeCard', id }) },
	];
}

function phaseMenu(
	board: BoardState,
	dispatch: (action: BoardAction) => void,
	id: Id,
	index: number,
	last: number,
): CardMenuAction[] {
	const phase = board.phases[id];
	const only = board.phaseOrder.length === 1;
	return [
		{
			label: 'Add a note',
			run: () =>
				dispatch({
					type: 'setPhaseNotes',
					id,
					text: phase && phase.notes.length > 0 ? `${phase.notes.join('\n\n')}\n\nNew note` : 'New note',
				}),
		},
		{
			label: 'Move earlier',
			separated: true,
			run: index > 0 ? () => dispatch({ type: 'movePhase', id, index: index - 1 }) : undefined,
			disabledReason: index > 0 ? undefined : 'It is already first.',
		},
		{
			label: 'Move later',
			run: index < last ? () => dispatch({ type: 'movePhase', id, index: index + 1 }) : undefined,
			disabledReason: index < last ? undefined : 'It is already last.',
		},
		{
			label: 'Add a phase after it',
			separated: true,
			run: () => dispatch({ type: 'addPhase', index: index + 1 }),
		},
		{
			// The last one is emptied rather than deleted — otherwise there is
			// nowhere to put a card and no `+` to press. The label says which.
			label: only ? 'Clear the wall' : 'Delete the phase and its cards',
			separated: true,
			run: () => dispatch({ type: 'removePhase', id }),
		},
	];
}
