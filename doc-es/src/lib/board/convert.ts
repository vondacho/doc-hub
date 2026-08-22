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
import { emptyBoard, type BoardState, type Card, type Id, type Phase } from './state.ts';

let counter = 0;

/** `p1`, `c4` — the prefix makes a stray id readable in a log. */
export function nextId(prefix: 'p' | 'c'): Id {
	counter += 1;
	return `${prefix}${counter}`;
}

export function resetIds(): void {
	counter = 0;
}

export function toBoard(document: EventStormDocument): BoardState {
	const phases: Record<Id, Phase> = {};
	const phaseOrder: Id[] = [];
	const cards: Record<Id, Card> = {};

	for (const phase of document.phases) {
		const phaseId = nextId('p');
		const cardIds = phase.cards.map((card) => {
			const id = nextId('c');
			cards[id] = { id, kind: card.kind, title: card.title, notes: [...card.notes] };
			return id;
		});
		phases[phaseId] = { id: phaseId, title: phase.title, notes: [...phase.notes], cardIds };
		phaseOrder.push(phaseId);
	}

	return {
		...emptyBoard(document.title),
		product: document.product,
		notes: [...document.notes],
		phaseOrder,
		phases,
		cards,
	};
}

export function toDocument(board: BoardState): EventStormDocument {
	return {
		title: board.title,
		product: board.product,
		notes: [...board.notes],
		phases: board.phaseOrder.flatMap((phaseId) => {
			const phase = board.phases[phaseId];
			if (!phase) return [];
			return [
				{
					title: phase.title,
					notes: [...phase.notes],
					cards: phase.cardIds.flatMap((id) => {
						const card = board.cards[id];
						return card ? [{ kind: card.kind, title: card.title, notes: [...card.notes] }] : [];
					}),
				},
			];
		}),
	};
}
