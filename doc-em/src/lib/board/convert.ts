/**
 * The seam between the file and the board.
 *
 * The entire cost of keeping two models, and the reason src/lib/examplemap/ has
 * no idea what an id is — which is what let its lexer and error reporting be
 * copied here from doc-sm in the first place, and what will let them be copied
 * once more into doc-es.
 *
 * Ids come from a module-scoped counter rather than crypto.randomUUID(), so
 * toBoard is a deterministic function of its input.
 */

import { STEP_CLAUSES, type ExampleMapDocument, type QuestionNode } from '../examplemap/model.ts';
import {
	bands,
	cellKey,
	emptyBoard,
	examplesIn,
	UNSCHEDULED,
	type BandId,
	type BoardState,
	type Card,
	type CellKey,
	type Delivery,
	type Example,
	type Id,
	type Rule,
} from './state.ts';

let counter = 0;

/** `r1`, `e4`, `q7`, `d2` — the prefix makes a stray id readable in a log. */
export function nextId(prefix: 'r' | 'e' | 'q' | 'd'): Id {
	counter += 1;
	return `${prefix}${counter}`;
}

export function resetIds(): void {
	counter = 0;
}

export function toBoard(document: ExampleMapDocument): BoardState {
	const deliveries: Record<Id, Delivery> = {};
	const deliveryOrder: Id[] = [];
	const rules: Record<Id, Rule> = {};
	const ruleOrder: Id[] = [];
	const examples: Record<Id, Example> = {};
	const cells: Record<CellKey, Id[]> = {};
	const questions: Record<Id, Card> = {};

	// Title to band id. The file references a delivery by title; the board
	// references it by id, and this is the only place the two meet. Duplicate
	// titles cannot reach here — the parser rejects them, which is what makes a
	// title a usable key at all.
	const bandOf = new Map<string, Id>();
	for (const delivery of document.deliveries) {
		const id = nextId('d');
		deliveries[id] = {
			id,
			title: delivery.title,
			kind: delivery.kind,
			ticket: delivery.ticket,
			points: delivery.points,
			notes: [...delivery.notes],
		};
		deliveryOrder.push(id);
		bandOf.set(delivery.title, id);
	}

	const addQuestions = (nodes: readonly QuestionNode[]): Id[] =>
		nodes.map((node) => {
			const id = nextId('q');
			questions[id] = { id, title: node.title, notes: [...node.notes] };
			return id;
		});

	const storyQuestions = addQuestions(document.story.questions);

	for (const rule of document.rules) {
		const ruleId = nextId('r');
		for (const example of rule.examples) {
			const id = nextId('e');
			examples[id] = {
				id,
				title: example.title,
				notes: [...example.notes],
				given: [...example.given],
				when: [...example.when],
				then: [...example.then],
			};
			// An unresolvable name cannot occur — the parser errors on one — so the
			// fallback is for `null`, which is the ordinary unscheduled case.
			const band: BandId = (example.delivery !== null ? bandOf.get(example.delivery) : undefined) ?? UNSCHEDULED;
			const key = cellKey(ruleId, band);
			(cells[key] ??= []).push(id);
		}
		rules[ruleId] = {
			id: ruleId,
			title: rule.title,
			notes: [...rule.notes],
			questionIds: addQuestions(rule.questions),
		};
		ruleOrder.push(ruleId);
	}

	return {
		...emptyBoard(document.title),
		notes: [...document.notes],
		product: document.product,
		space: document.space,
		story: {
			title: document.story.title,
			notes: [...document.story.notes],
			ticket: document.story.ticket,
			status: document.story.status,
			release: (document.story.release !== null ? bandOf.get(document.story.release) : undefined) ?? null,
			questions: storyQuestions,
		},
		deliveryOrder,
		deliveries,
		ruleOrder,
		rules,
		examples,
		cells,
		questions,
	};
}

export function toDocument(board: BoardState): ExampleMapDocument {
	const question = (id: Id): QuestionNode[] => {
		const card = board.questions[id];
		return card ? [{ title: card.title, notes: [...card.notes] }] : [];
	};

	// Band id back to title, for the `@delivery` each card is tagged with. The
	// inverse of the map `toBoard` built, and the reason neither direction has to
	// guess: the file speaks titles, the board speaks ids, and the conversion is
	// the only thing that knows both.
	const titleOf = (band: BandId): string | null =>
		band === UNSCHEDULED ? null : (board.deliveries[band]?.title ?? null);

	return {
		title: board.title,
		product: board.product,
		space: board.space,
		notes: [...board.notes],
		deliveries: board.deliveryOrder.flatMap((id) => {
			const delivery = board.deliveries[id];
			return delivery
				? [
						{
							title: delivery.title,
							kind: delivery.kind,
							ticket: delivery.ticket,
							points: delivery.points,
							notes: [...delivery.notes],
						},
					]
				: [];
		}),
		story: {
			title: board.story.title,
			notes: [...board.story.notes],
			ticket: board.story.ticket,
			status: board.story.status,
			release: board.story.release === null ? null : titleOf(board.story.release),
			questions: board.story.questions.flatMap(question),
		},
		rules: board.ruleOrder.flatMap((ruleId) => {
			const rule = board.rules[ruleId];
			if (!rule) return [];
			return [
				{
					title: rule.title,
					notes: [...rule.notes],
					// Read down the timeline, so the file lists a rule's examples in
					// the order the column shows them: earliest band first, and the
					// unscheduled ones last.
					examples: bands(board).flatMap((band) =>
						examplesIn(board, ruleId, band).flatMap((id) => {
							const card = board.examples[id];
							if (!card) return [];
							// Blank steps are dropped here rather than in the serializer, so
							// that the document model — which is what `.examplemap` and the
							// feature file are both written from — never carries a step that
							// says nothing.
							const written = (clause: (typeof STEP_CLAUSES)[number]) =>
								card[clause].map((step) => step.trim()).filter((step) => step !== '');
							return [
								{
									title: card.title,
									notes: [...card.notes],
									// Derived from the cell, never stored on the card — the
									// argument for that is at the top of state.ts.
									delivery: titleOf(band),
									given: written('given'),
									when: written('when'),
									then: written('then'),
								},
							];
						}),
					),
					questions: rule.questionIds.flatMap(question),
				},
			];
		}),
	};
}

/**
 * Rebuild a board from text the visitor edited in the preview.
 *
 * @throws {ExampleMapParseError} when the text does not parse; the caller shows
 *         the problems and leaves the board alone.
 */
export function applyText(source: string, parse: (s: string) => ExampleMapDocument): BoardState {
	const parsed = parse(source);
	resetIds();
	return toBoard(parsed);
}
