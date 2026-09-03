/**
 * The vocabulary of gestures.
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

import type { CardKind } from '../eventstorm/model.ts';
import type { CellKey, Id } from './state.ts';

export type BoardAction =
	| { type: 'import'; text: string }
	/** Edited preview text: replaces the board but keeps the undo history. */
	| { type: 'applyText'; text: string }
	| { type: 'reset' }
	| { type: 'setMapTitle'; title: string }
	| { type: 'setProduct'; product: string | null }
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
	/**
	 * Write a note's tags. The list replaces whatever it had.
	 *
	 * Whole rather than add-one/remove-one, because that is the shape the editor
	 * on the note produces: somebody types a line of labels and commits it. An
	 * empty list clears them, and is the ordinary way a tag is taken off.
	 */
	| { type: 'setCardTags'; id: Id; tags: readonly string[] }
	/** Re-colour a note: what looked like an event turns out to be a hotspot. */
	| { type: 'setCardKind'; id: Id; kind: CardKind }
	| { type: 'removeCard'; id: Id }
	/** A drag between squares: the lane and the column may each change. */
	| { type: 'moveCard'; cardId: Id; from: CellKey; to: CellKey; index: number };

/** Actions that open a different document; history.ts clears on these. */
export function resetsHistory(action: BoardAction): boolean {
	return action.type === 'import' || action.type === 'reset';
}

