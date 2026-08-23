/**
 * The seam between the file and the board.
 *
 * The entire cost of keeping two models, and the reason src/lib/eventstorm/ has
 * no idea what an id is — which is what let its lexer and error reporting be
 * copied here from doc-em, as doc-em copied them from doc-sm.
 *
 * Ids come from a module-scoped counter rather than crypto.randomUUID(), so
 * toBoard is a deterministic function of its input.
 */

import type { EventStormDocument } from '../eventstorm/model.ts';
import { cellKey, emptyBoard, splitCellKey, type BoardState, type Card, type CellKey, type Id, type Lane } from './state.ts';

let counter = 0;

/** `l1`, `c4` — the prefix makes a stray id readable in a log. */
export function nextId(prefix: 'l' | 'c'): Id {
	counter += 1;
	return `${prefix}${counter}`;
}

export function resetIds(): void {
	counter = 0;
}

export function toBoard(document: EventStormDocument): BoardState {
	const lanes: Record<Id, Lane> = {};
	const laneOrder: Id[] = [];
	const cards: Record<Id, Card> = {};
	const cells: Record<CellKey, Id[]> = {};

	for (const lane of document.lanes) {
		const laneId = nextId('l');
		lanes[laneId] = { id: laneId, title: lane.title, notes: [...lane.notes] };
		laneOrder.push(laneId);

		// Sorted by column so a stack is built left to right and, within one
		// square, in the order the file lists them — which is the order the
		// serializer preserved and the only record of a stacking order there is.
		for (const card of [...lane.cards].sort((a, b) => a.column - b.column)) {
			const id = nextId('c');
			cards[id] = { id, kind: card.kind, title: card.title, notes: [...card.notes] };
			const key = cellKey(laneId, card.column);
			(cells[key] ??= []).push(id);
		}
	}

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

export function toDocument(board: BoardState): EventStormDocument {
	// Which cards are on which lane, and at what column. Walked once here rather
	// than searched per lane, so a wall with a thousand notes on it stays linear.
	const byLane = new Map<Id, { column: number; ids: readonly Id[] }[]>();
	for (const [key, ids] of Object.entries(board.cells)) {
		if (ids.length === 0) continue;
		const { laneId, column } = splitCellKey(key);
		const found = byLane.get(laneId) ?? [];
		found.push({ column, ids });
		byLane.set(laneId, found);
	}

	return {
		title: board.title,
		product: board.product,
		level: board.level,
		notes: [...board.notes],
		lanes: board.laneOrder.flatMap((laneId) => {
			const lane = board.lanes[laneId];
			if (!lane) return [];
			const squares = (byLane.get(laneId) ?? []).sort((a, b) => a.column - b.column);
			return [
				{
					title: lane.title,
					notes: [...lane.notes],
					cards: squares.flatMap(({ column, ids }) =>
						ids.flatMap((id) => {
							const card = board.cards[id];
							// Derived from the cell, never stored on the card — the
							// argument for that is at the top of state.ts.
							return card ? [{ kind: card.kind, title: card.title, column, notes: [...card.notes] }] : [];
						}),
					),
				},
			];
		}),
	};
}
