/**
 * Every change the board can make, as one pure function.
 *
 * Imports nothing from React. This file is the tool; the island is a way to
 * drive it — the same separation doc-sm and doc-em draw, and the reason all
 * three can be exercised from a shell script before any component exists.
 *
 * A reducer that declines to act returns the *same object*, because history.ts
 * uses an identity check to decide whether an action consumed an undo step.
 */

import { emptyPhase, splitNotes, UNNAMED_PHASE, type CardKind } from '../eventstorm/model.ts';
import { nextId } from './convert.ts';
import type { BoardState, Card, Id, Phase } from './state.ts';

export type BoardAction =
	| { type: 'import'; board: BoardState }
	/** Edited preview text: replaces the board but keeps the undo history. */
	| { type: 'applyText'; board: BoardState }
	| { type: 'reset' }
	| { type: 'setMapTitle'; title: string }
	| { type: 'setProduct'; product: string | null }
	| { type: 'addPhase'; index: number }
	| { type: 'retitlePhase'; id: Id; title: string }
	| { type: 'setPhaseNotes'; id: Id; text: string }
	/**
	 * Delete a phase. Its cards go with it.
	 *
	 * Unlike a delivery band on the other two boards, a phase is not a schedule a
	 * card could fall out of — it is the stretch of wall the card is stuck to.
	 * There is nowhere else for the cards to be, so the label says they go too.
	 */
	| { type: 'removePhase'; id: Id }
	| { type: 'movePhase'; id: Id; index: number }
	| { type: 'addCard'; phaseId: Id; kind: CardKind; index?: number }
	| { type: 'retitleCard'; id: Id; title: string }
	| { type: 'setCardNotes'; id: Id; text: string }
	/** Re-colour a note: what looked like an event turns out to be a hotspot. */
	| { type: 'setCardKind'; id: Id; kind: CardKind }
	| { type: 'removeCard'; id: Id }
	| { type: 'moveCard'; cardId: Id; from: Id; to: Id; index: number };

/** Actions that open a different document; history.ts clears on these. */
export function resetsHistory(action: BoardAction): boolean {
	return action.type === 'import' || action.type === 'reset';
}

/** What a new note says before anybody writes on it, per kind. */
const placeholder: Record<CardKind, string> = {
	event: 'Something happened',
	actor: 'Somebody',
	system: 'Some system',
	hotspot: 'Something nobody agrees on',
	opportunity: 'Something worth doing',
};

export function reduce(board: BoardState, action: BoardAction): BoardState {
	switch (action.type) {
		case 'import':
		case 'applyText':
			return action.board;

		case 'reset': {
			// A board always has a wall, even a blank one: the practice starts with
			// paper on a wall, and the first `+` needs somewhere to be.
			const id = nextId('p');
			return {
				...board,
				product: null,
				notes: [],
				phaseOrder: [id],
				phases: { [id]: { id, ...emptyPhase(), cardIds: [] } },
				cards: {},
			};
		}

		case 'setMapTitle':
			return action.title.trim() === '' || action.title === board.title
				? board
				: { ...board, title: action.title };

		case 'setProduct':
			return action.product === board.product ? board : { ...board, product: action.product };

		case 'addPhase': {
			const id = nextId('p');
			return {
				...board,
				phases: { ...board.phases, [id]: { id, title: freshPhaseTitle(board), notes: [], cardIds: [] } },
				phaseOrder: insertAt(board.phaseOrder, action.index, id),
			};
		}

		case 'retitlePhase': {
			const phase = board.phases[action.id];
			const title = action.title.trim();
			if (!phase || title === '' || title === phase.title) return board;
			return { ...board, phases: { ...board.phases, [action.id]: { ...phase, title } } };
		}

		case 'setPhaseNotes': {
			const phase = board.phases[action.id];
			if (!phase) return board;
			return {
				...board,
				phases: { ...board.phases, [action.id]: { ...phase, notes: splitNotes(action.text) } },
			};
		}

		case 'removePhase':
			return removePhase(board, action.id);

		case 'movePhase': {
			const order = moveWithin(board.phaseOrder, action.id, action.index);
			return order === board.phaseOrder ? board : { ...board, phaseOrder: order };
		}

		case 'addCard': {
			const phase = board.phases[action.phaseId];
			if (!phase) return board;
			const id = nextId('c');
			const card: Card = { id, kind: action.kind, title: placeholder[action.kind], notes: [] };
			return {
				...board,
				cards: { ...board.cards, [id]: card },
				phases: {
					...board.phases,
					[phase.id]: { ...phase, cardIds: insertAt(phase.cardIds, action.index ?? phase.cardIds.length, id) },
				},
			};
		}

		case 'retitleCard': {
			const card = board.cards[action.id];
			const title = action.title.trim();
			if (!card || title === '' || title === card.title) return board;
			return { ...board, cards: { ...board.cards, [action.id]: { ...card, title } } };
		}

		case 'setCardNotes': {
			const card = board.cards[action.id];
			if (!card) return board;
			return {
				...board,
				cards: { ...board.cards, [action.id]: { ...card, notes: splitNotes(action.text) } },
			};
		}

		case 'setCardKind': {
			const card = board.cards[action.id];
			if (!card || card.kind === action.kind) return board;
			return { ...board, cards: { ...board.cards, [action.id]: { ...card, kind: action.kind } } };
		}

		case 'removeCard': {
			const card = board.cards[action.id];
			if (!card) return board;
			const cards = { ...board.cards };
			delete cards[action.id];
			return {
				...board,
				cards,
				phases: mapPhases(board, (phase) => ({
					...phase,
					cardIds: phase.cardIds.filter((c) => c !== action.id),
				})),
			};
		}

		case 'moveCard':
			return moveCard(board, action.cardId, action.from, action.to, action.index);
	}
}

function moveCard(board: BoardState, id: Id, fromId: Id, toId: Id, index: number): BoardState {
	const from = board.phases[fromId];
	const to = board.phases[toId];
	if (!from || !to || !from.cardIds.includes(id)) return board;

	if (fromId === toId) {
		const reordered = moveWithin(from.cardIds, id, index);
		return reordered === from.cardIds
			? board
			: { ...board, phases: { ...board.phases, [fromId]: { ...from, cardIds: reordered } } };
	}

	return {
		...board,
		phases: {
			...board.phases,
			[fromId]: { ...from, cardIds: from.cardIds.filter((c) => c !== id) },
			[toId]: { ...to, cardIds: insertAt(to.cardIds, index, id) },
		},
	};
}

/**
 * Deleting a phase takes its cards with it, and never leaves the board wall-less.
 *
 * The last phase cannot be deleted — removing it would leave nowhere to put a
 * card and no `+` to press, which is a board you cannot get out of without
 * reloading the page. It is cleared instead, which is what somebody pressing
 * delete on the only stretch of wall actually means.
 */
function removePhase(board: BoardState, id: Id): BoardState {
	const phase = board.phases[id];
	if (!phase) return board;

	const cards = { ...board.cards };
	for (const cardId of phase.cardIds) delete cards[cardId];

	if (board.phaseOrder.length === 1) {
		return {
			...board,
			cards,
			phases: { [id]: { ...phase, title: UNNAMED_PHASE, notes: [], cardIds: [] } },
		};
	}

	const phases = { ...board.phases };
	delete phases[id];
	return { ...board, cards, phases, phaseOrder: board.phaseOrder.filter((p) => p !== id) };
}

/**
 * `Phase 3`, or the next number after the ones that already exist.
 *
 * A wall's stretches are named after what happens in them — "Checkout",
 * "Delivery" — and nobody can guess that, so the placeholder is a number and the
 * author renames it. Counting avoids handing out a name that is already taken,
 * which would be confusing rather than wrong.
 */
function freshPhaseTitle(board: BoardState): string {
	const taken = new Set(Object.values(board.phases).map((phase) => phase.title));
	for (let n = board.phaseOrder.length + 1; ; n += 1) {
		const candidate = `Phase ${n}`;
		if (!taken.has(candidate)) return candidate;
	}
}

function mapPhases(board: BoardState, fn: (phase: Phase) => Phase): Record<Id, Phase> {
	const out: Record<Id, Phase> = {};
	for (const [id, phase] of Object.entries(board.phases)) out[id] = fn(phase);
	return out;
}

function insertAt<T>(list: readonly T[], index: number, value: T): T[] {
	const out = [...list];
	out.splice(Math.max(0, Math.min(index, out.length)), 0, value);
	return out;
}

/** Same array back when nothing moved, so history.ts does not record a step. */
function moveWithin<T>(list: readonly T[], value: T, index: number): readonly T[] {
	const from = list.indexOf(value);
	if (from === -1) return list;
	const to = Math.max(0, Math.min(index, list.length - 1));
	if (from === to) return list;
	const out = [...list];
	out.splice(from, 1);
	out.splice(to, 0, value);
	return out;
}
