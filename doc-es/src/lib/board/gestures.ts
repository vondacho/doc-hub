/**
 * The vocabulary of gestures, and the one query the level control needs.
 *
 * This was `reducer.ts`, and it deliberately no longer holds a reducer. The
 * text is the source of truth now: a gesture is not folded into a `BoardState`,
 * it is translated into a splice by `apply.ts` and written into the file.
 *
 * What survives here is the *shape* of each gesture — the union below — because
 * that is the language the grid speaks. Keeping it is why `BoardGrid`, `Card`,
 * `Cell` and `CardMenu` did not change at all: they still say what the visitor
 * did, and something else decides what that does to the text.
 */

import { kindsFor, type CardKind, type Level } from '../eventstorm/model.ts';
import type { BoardState, Card, CellKey, Id } from './state.ts';

export type BoardAction =
	| { type: 'import'; text: string }
	/** Edited preview text: replaces the board but keeps the undo history. */
	| { type: 'applyText'; text: string }
	| { type: 'reset' }
	| { type: 'setMapTitle'; title: string }
	| { type: 'setProduct'; product: string | null }
	/**
	 * Change which workshop this is.
	 *
	 * Refused when the wall already carries notes the new level has no colour
	 * for. The board must not hold a state the file cannot express, and a storm
	 * whose level does not admit its own cards is exactly that — the parser
	 * rejects one, so the board must not produce one. The picker disables those
	 * levels with a reason rather than letting the click fail silently.
	 */
	| { type: 'setLevel'; level: Level }
	| { type: 'addLane'; index: number }
	| { type: 'retitleLane'; id: Id; title: string }
	| { type: 'setLaneNotes'; id: Id; text: string }
	/**
	 * Delete a lane. Its cards go with it.
	 *
	 * A lane is not a schedule a card could fall out of — it is the row the card
	 * is stuck to. There is nowhere else for the cards to be, so the label says
	 * they go too. The last lane is cleared instead of removed: a board with no
	 * lane has no square to place anything on.
	 */
	| { type: 'removeLane'; id: Id }
	| { type: 'moveLane'; id: Id; index: number }
	/** Place a note on a square. It stacks under whatever is already there. */
	| { type: 'addCard'; laneId: Id; column: number; kind: CardKind }
	| { type: 'retitleCard'; id: Id; title: string }
	| { type: 'setCardNotes'; id: Id; text: string }
	/** Re-colour a note: what looked like an event turns out to be a hotspot. */
	| { type: 'setCardKind'; id: Id; kind: CardKind }
	| { type: 'removeCard'; id: Id }
	/** A drag between squares: the lane and the column may each change. */
	| { type: 'moveCard'; cardId: Id; from: CellKey; to: CellKey; index: number };

/** Actions that open a different document; history.ts clears on these. */
export function resetsHistory(action: BoardAction): boolean {
	return action.type === 'import' || action.type === 'reset';
}

/**
 * The notes a level would leave without a colour.
 *
 * Exported so the picker can say *why* a level is unavailable and how many cards
 * stand in the way, rather than showing a control that does nothing. The reducer
 * refuses the change either way — this is the explanation, not the guard.
 */
export function orphanedBy(board: BoardState, level: Level): readonly Card[] {
	const allowed = new Set(kindsFor(level));
	return Object.values(board.cards).filter((card) => !allowed.has(card.kind));
}
