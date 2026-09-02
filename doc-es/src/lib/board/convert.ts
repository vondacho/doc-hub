/**
 * The seam between the file and the board.
 *
 * The entire cost of keeping two models, and the reason src/lib/eventstorm/ has
 * no idea what an id is — which is what let its lexer and error reporting be
 * copied here from doc-em, as doc-em copied them from doc-sm.
 *
 * ## Ids are positions, and that is the whole design
 *
 * The text is the source of truth, and text has no id column. A card's identity
 * is therefore *where it is written*: `l2` is the third lane, `l2c5` is the
 * sixth card written inside it. Two consequences, and both are the point.
 *
 * **A reparse yields the same id for a card nobody moved.** That is what lets
 * the board keep React keys, an open card menu and a drag in flight across the
 * keystroke-by-keystroke reparsing the editor pane causes. A counter would mint
 * fresh ids on every parse and the board would remount itself as you typed.
 *
 * **An id decodes back to a position in the document**, which is how a gesture
 * finds the node whose span it is about to splice — see `edit.ts`. No lookup
 * table, and no second source of identity to drift.
 *
 * The cost, accepted deliberately: ids shift when text above them changes. Move
 * the second lane and every card below it is renumbered. Nothing may hold an id
 * across an edit and expect it to still mean the same card — which is why every
 * gesture takes the id, resolves it and splices in one go.
 *
 * ba-ddd-mapper does not need this: in `.ddd` a name *is* an identity, so its
 * ids are derived from names. Two notes on a wall may legitimately carry the
 * same words, so that trick is not available here.
 */

import type { EventStormDocument } from '../eventstorm/model.ts';
import { cellKey, emptyBoard, type BoardState, type Card, type CellKey, type Id, type Lane } from './state.ts';

/** `l2` — the third lane, counting from the top of the file. */
export function laneId(index: number): Id {
	return `l${index}`;
}

/** `l2c5` — the sixth card written inside the third lane. */
export function cardId(lane: number, card: number): Id {
	return `l${lane}c${card}`;
}

/** The lane and card a card id names, or null if it names no card. */
export function positionOf(id: Id): { lane: number; card: number } | null {
	const found = /^l(\d+)c(\d+)$/.exec(id);
	return found === null ? null : { lane: Number(found[1]), card: Number(found[2]) };
}

/** The lane a lane id names, or null. */
export function lanePositionOf(id: Id): number | null {
	const found = /^l(\d+)$/.exec(id);
	return found === null ? null : Number(found[1]);
}

export function toBoard(document: EventStormDocument): BoardState {
	const lanes: Record<Id, Lane> = {};
	const laneOrder: Id[] = [];
	const cards: Record<Id, Card> = {};
	const cells: Record<CellKey, Id[]> = {};

	document.lanes.forEach((lane, laneIndex) => {
		const lid = laneId(laneIndex);
		lanes[lid] = { id: lid, title: lane.title, notes: [...lane.notes] };
		laneOrder.push(lid);

		/*
		 * Sorted by column so a stack is built left to right and, within one
		 * square, in the order the file lists them — the only record of a stacking
		 * order there is.
		 *
		 * The *index* carried through the sort is the position in the file, not
		 * the position in this sorted list. That is what keeps an id meaning the
		 * same card after a neighbour's column changes: the id names where the
		 * card is written, and sorting is a rendering concern.
		 */
		lane.cards
			.map((card, cardIndex) => ({ card, cardIndex }))
			.sort((a, b) => a.card.column - b.card.column)
			.forEach(({ card, cardIndex }) => {
				const id = cardId(laneIndex, cardIndex);
				cards[id] = { id, kind: card.kind, title: card.title, notes: [...card.notes], tags: [...card.tags] };
				const key = cellKey(lid, card.column);
				(cells[key] ??= []).push(id);
			});
	});

	return {
		...emptyBoard(document.title),
		product: document.product,
		level: document.level,
		notes: [...document.notes],
		laneOrder,
		lanes,
		cards,
		cells,
	};
}
