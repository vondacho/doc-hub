/**
 * The board model — an event storm as the UI needs it.
 *
 * Normalised, with generated ids, like doc-sm's and doc-em's. It is the simplest
 * of the three, and that is the practice rather than an omission: a Big Picture
 * wall is a line of coloured notes with the occasional boundary drawn on it.
 * There is no second axis, no cell, and nothing nested more than one deep.
 *
 * The deeper levels will change that. Software Design gathers commands and
 * events under an aggregate, which is the first genuinely nested thing event
 * storming has — and when it arrives, `Card` is the type that grows children
 * rather than a parallel hierarchy appearing beside it.
 *
 * Ids are in-memory only. They are never written to an `.eventstorm` file and
 * are regenerated on every import; nothing outside this tab refers to them.
 */

import { type CardKind } from '../eventstorm/model.ts';

export type { CardKind };
export type Id = string;

export interface Card {
	readonly id: Id;
	/** Which of the five this note is. The colour, and what the colour means. */
	readonly kind: CardKind;
	readonly title: string;
	readonly notes: readonly string[];
}

/**
 * One stretch of the wall, holding its cards in time order.
 *
 * `cardIds` rather than a cell record: there is one axis here, so a card belongs
 * to a phase at a position and that is the whole of its placement. doc-sm and
 * doc-em both need a `${column}|${band}` key because both have two axes; this
 * one would be keying a list by a constant.
 */
export interface Phase {
	readonly id: Id;
	readonly title: string;
	readonly notes: readonly string[];
	readonly cardIds: readonly Id[];
}

export interface BoardState {
	readonly title: string;
	/** The registered product's shortname, or null for a storm about no product. */
	readonly product: string | null;
	readonly notes: readonly string[];
	/** Left to right is time. Order is the only statement of sequence. */
	readonly phaseOrder: readonly Id[];
	readonly phases: Readonly<Record<Id, Phase>>;
	readonly cards: Readonly<Record<Id, Card>>;
}

export function emptyBoard(title = 'Untitled event storm'): BoardState {
	return { title, product: null, notes: [], phaseOrder: [], phases: {}, cards: {} };
}

/** The phase a card sits in, or undefined when the board has lost it. */
export function phaseOfCard(board: BoardState, cardId: Id): Phase | undefined {
	for (const id of board.phaseOrder) {
		if (board.phases[id]?.cardIds.includes(cardId)) return board.phases[id];
	}
	return undefined;
}

/** Every card on the wall, read left to right and then down each phase. */
export function cardsInOrder(board: BoardState): readonly Id[] {
	return board.phaseOrder.flatMap((id) => board.phases[id]?.cardIds ?? []);
}

/**
 * Every card that has a note.
 *
 * Not "every card": a card with no notes has no caret and nothing to reveal, so
 * counting it would make the global toggle claim to have expanded something it
 * did not. Unlike doc-em there is no card here that carries a template — a note
 * on a sticky is an afterthought somebody added, not a shape the card has.
 */
export function cardsWithDetail(board: BoardState): readonly Id[] {
	const found: Id[] = [];
	for (const [id, phase] of Object.entries(board.phases)) if (phase.notes.length > 0) found.push(id);
	for (const [id, card] of Object.entries(board.cards)) if (card.notes.length > 0) found.push(id);
	return found;
}
