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

import { kindsFor, newCardTitle, splitNotes, UNNAMED_LANE, type CardKind, type Level } from '../eventstorm/model.ts';
import { nextId } from './convert.ts';
import { cellKey, cellOfCard, splitCellKey, type BoardState, type Card, type CellKey, type Id } from './state.ts';

export type BoardAction =
	| { type: 'import'; board: BoardState }
	/** Edited preview text: replaces the board but keeps the undo history. */
	| { type: 'applyText'; board: BoardState }
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

export function reduce(board: BoardState, action: BoardAction): BoardState {
	switch (action.type) {
		case 'import':
		case 'applyText':
			return action.board;

		case 'reset': {
			// A board always has a lane, even a blank one: the practice starts with
			// paper on a wall, and the first empty square needs somewhere to be.
			const id = nextId('l');
			return {
				...board,
				product: null,
				notes: [],
				laneOrder: [id],
				lanes: { [id]: { id, title: UNNAMED_LANE, notes: [] } },
				cards: {},
				cells: {},
			};
		}

		case 'setMapTitle':
			return action.title.trim() === '' || action.title === board.title
				? board
				: { ...board, title: action.title };

		case 'setProduct':
			return action.product === board.product ? board : { ...board, product: action.product };

		case 'setLevel': {
			if (action.level === board.level) return board;
			const allowed = new Set(kindsFor(action.level));
			const orphans = Object.values(board.cards).filter((card) => !allowed.has(card.kind));
			if (orphans.length > 0) return board;
			return { ...board, level: action.level };
		}

		case 'addLane': {
			const id = nextId('l');
			return {
				...board,
				lanes: { ...board.lanes, [id]: { id, title: freshLaneTitle(board), notes: [] } },
				laneOrder: insertAt(board.laneOrder, action.index, id),
			};
		}

		case 'retitleLane': {
			const lane = board.lanes[action.id];
			const title = action.title.trim();
			if (!lane || title === '' || title === lane.title) return board;
			return { ...board, lanes: { ...board.lanes, [action.id]: { ...lane, title } } };
		}

		case 'setLaneNotes': {
			const lane = board.lanes[action.id];
			if (!lane) return board;
			return { ...board, lanes: { ...board.lanes, [action.id]: { ...lane, notes: splitNotes(action.text) } } };
		}

		case 'removeLane':
			return removeLane(board, action.id);

		case 'moveLane': {
			const order = moveWithin(board.laneOrder, action.id, action.index);
			return order === board.laneOrder ? board : { ...board, laneOrder: order };
		}

		case 'addCard': {
			if (!board.lanes[action.laneId] || action.column < 1) return board;
			const id = nextId('c');
			const card: Card = { id, kind: action.kind, title: newCardTitle[action.kind], notes: [] };
			const key = cellKey(action.laneId, action.column);
			return {
				...board,
				cards: { ...board.cards, [id]: card },
				cells: { ...board.cells, [key]: [...(board.cells[key] ?? []), id] },
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
			return { ...board, cards: { ...board.cards, [action.id]: { ...card, notes: splitNotes(action.text) } } };
		}

		case 'setCardKind': {
			const card = board.cards[action.id];
			if (!card || card.kind === action.kind) return board;
			return { ...board, cards: { ...board.cards, [action.id]: { ...card, kind: action.kind } } };
		}

		case 'removeCard': {
			if (!board.cards[action.id]) return board;
			const cards = { ...board.cards };
			delete cards[action.id];
			const key = cellOfCard(board, action.id);
			const cells = { ...board.cells };
			if (key !== undefined) cells[key] = (cells[key] ?? []).filter((c) => c !== action.id);
			return { ...board, cards, cells };
		}

		case 'moveCard':
			return moveCard(board, action.cardId, action.from, action.to, action.index);
	}
}

/**
 * A drag from one square to another — which is how a note is both moved along
 * the timeline and moved between lanes.
 *
 * One operation for both, because on this board they are one gesture. Sideways
 * changes when it happens; up or down changes whose lane it is on; diagonally
 * does both, and there is no reading under which that should need two undo
 * steps.
 */
function moveCard(board: BoardState, id: Id, from: CellKey, to: CellKey, index: number): BoardState {
	const source = board.cells[from];
	if (!source?.includes(id)) return board;

	const { laneId, column } = splitCellKey(to);
	if (!board.lanes[laneId] || !Number.isInteger(column) || column < 1) return board;

	if (from === to) {
		const reordered = moveWithin(source, id, index);
		return reordered === source ? board : { ...board, cells: { ...board.cells, [from]: reordered } };
	}

	return {
		...board,
		cells: {
			...board.cells,
			[from]: source.filter((c) => c !== id),
			[to]: insertAt(board.cells[to] ?? [], index, id),
		},
	};
}

/**
 * Deleting a lane takes its cards with it, and never leaves the board laneless.
 *
 * The last lane cannot be deleted — removing it would leave nowhere to put a
 * card and no square to press, which is a board you cannot get out of without
 * reloading the page. It is cleared instead, which is what somebody pressing
 * delete on the only row actually means.
 */
function removeLane(board: BoardState, id: Id): BoardState {
	const lane = board.lanes[id];
	if (!lane) return board;

	const cards = { ...board.cards };
	const cells = { ...board.cells };
	for (const [key, ids] of Object.entries(board.cells)) {
		if (splitCellKey(key).laneId !== id) continue;
		for (const cardId of ids) delete cards[cardId];
		delete cells[key];
	}

	if (board.laneOrder.length === 1) {
		return { ...board, cards, cells, lanes: { [id]: { ...lane, title: UNNAMED_LANE, notes: [] } } };
	}

	const lanes = { ...board.lanes };
	delete lanes[id];
	return { ...board, cards, cells, lanes, laneOrder: board.laneOrder.filter((l) => l !== id) };
}

/**
 * `Lane 3`, or the next number after the ones that already exist.
 *
 * A lane is named after whose track it is — "Customer", "Kitchen" — and nobody
 * can guess that, so the placeholder is a number and the author renames it.
 * Counting avoids handing out a name that is already taken.
 */
function freshLaneTitle(board: BoardState): string {
	const taken = new Set(Object.values(board.lanes).map((lane) => lane.title));
	for (let n = board.laneOrder.length + 1; ; n += 1) {
		const candidate = `Lane ${n}`;
		if (!taken.has(candidate)) return candidate;
	}
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
