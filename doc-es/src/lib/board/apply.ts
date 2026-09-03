/**
 * A gesture, turned into an edit of the source text.
 *
 * The seam that let the whole grid stay as it was. `BoardGrid`, `Card`, `Cell`
 * and `CardMenu` still say what the visitor did — `{ type: 'moveCard', … }` —
 * and this decides what that does to the file. Nothing above this line knows
 * that the board is a projection of text rather than a state of its own.
 *
 * ## Ids in, positions out
 *
 * The grid holds ids because dnd-kit needs them; the edit layer takes positions
 * because a splice is about where something is written. Translating between the
 * two is this module's other job, and it is why every case below either
 * resolves cleanly or hands the source back untouched. An id that no longer
 * names anything is a stale render, not an emergency: the next parse will bring
 * the board back in step, and doing nothing is the only safe answer in the
 * meantime.
 */

import * as edit from './edit.ts';
import { lanePositionOf, positionOf } from './convert.ts';
import { splitCellKey, type BoardState } from './state.ts';
import type { BoardAction } from './gestures.ts';
import type { EventStormDocument } from '../eventstorm/model.ts';

/**
 * The text this gesture produces, or the text unchanged when it cannot be
 * placed.
 *
 * `import`, `applyText` and `reset` are not here: they replace the whole
 * document rather than editing one, so the board handles them directly.
 */
export function applyAction(
	source: string,
	document: EventStormDocument,
	board: BoardState,
	action: BoardAction,
): string {
	switch (action.type) {
		case 'setMapTitle':
			return edit.setMapTitle(source, document, action.title);

		case 'setProduct':
			return edit.setProduct(source, document, action.product);

		case 'addLane':
			return edit.addLane(source, document, action.index);

		case 'retitleLane': {
			const lane = lanePositionOf(action.id);
			return lane === null ? source : edit.retitleLane(source, document, lane, action.title);
		}

		case 'setLaneNotes': {
			const lane = lanePositionOf(action.id);
			return lane === null ? source : edit.setLaneNotes(source, document, lane, action.text);
		}

		case 'removeLane': {
			const lane = lanePositionOf(action.id);
			return lane === null ? source : edit.removeLane(source, document, lane);
		}

		case 'moveLane': {
			const lane = lanePositionOf(action.id);
			return lane === null ? source : edit.moveLane(source, document, lane, action.index);
		}

		case 'addCard': {
			const lane = lanePositionOf(action.laneId);
			return lane === null ? source : edit.addCard(source, document, lane, action.column, action.kind);
		}

		case 'retitleCard': {
			const at = positionOf(action.id);
			return at === null ? source : edit.retitleCard(source, document, at, action.title);
		}

		case 'setCardNotes': {
			const at = positionOf(action.id);
			return at === null ? source : edit.setCardNotes(source, document, at, action.text);
		}

		case 'setCardTags': {
			const at = positionOf(action.id);
			return at === null ? source : edit.setCardTags(source, document, at, action.tags);
		}

		case 'setCardKind': {
			const at = positionOf(action.id);
			return at === null ? source : edit.setCardKind(source, document, at, action.kind);
		}

		case 'removeCard': {
			const at = positionOf(action.id);
			return at === null ? source : edit.removeCard(source, document, at);
		}

		case 'moveCard': {
			const at = positionOf(action.cardId);
			const { laneId, column } = splitCellKey(action.to);
			const lane = lanePositionOf(laneId);
			if (at === null || lane === null) return source;

			/*
			 * The index dnd-kit reports counts the cards already rendered in the
			 * destination square. `edit.moveCard` counts the cards *written* in the
			 * destination lane at that column — the same set, in the same order,
			 * because `toBoard` builds a square by walking the file. So the number
			 * passes straight through.
			 */
			return edit.moveCard(source, document, at, lane, column, action.index);
		}

		// Handled by the board: these replace the document rather than edit it.
		case 'import':
		case 'applyText':
		case 'reset':
			return source;
	}
}

/** Whether this gesture is one `applyAction` can carry out. */
export function isEdit(action: BoardAction): boolean {
	return action.type !== 'import' && action.type !== 'applyText' && action.type !== 'reset';
}
