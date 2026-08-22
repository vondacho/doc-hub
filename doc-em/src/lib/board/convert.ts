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
import { emptyBoard, type BoardState, type Card, type Example, type Id, type Rule } from './state.ts';

let counter = 0;

/** `r1`, `e4`, `q7` — the prefix makes a stray id readable in a log. */
export function nextId(prefix: 'r' | 'e' | 'q'): Id {
	counter += 1;
	return `${prefix}${counter}`;
}

export function resetIds(): void {
	counter = 0;
}

export function toBoard(document: ExampleMapDocument): BoardState {
	const rules: Record<Id, Rule> = {};
	const ruleOrder: Id[] = [];
	const examples: Record<Id, Example> = {};
	const questions: Record<Id, Card> = {};

	const addQuestions = (nodes: readonly QuestionNode[]): Id[] =>
		nodes.map((node) => {
			const id = nextId('q');
			questions[id] = { id, title: node.title, notes: [...node.notes] };
			return id;
		});

	const storyQuestions = addQuestions(document.story.questions);

	for (const rule of document.rules) {
		const ruleId = nextId('r');
		const exampleIds = rule.examples.map((example) => {
			const id = nextId('e');
			examples[id] = {
				id,
				title: example.title,
				notes: [...example.notes],
				given: [...example.given],
				when: [...example.when],
				then: [...example.then],
			};
			return id;
		});
		rules[ruleId] = {
			id: ruleId,
			title: rule.title,
			notes: [...rule.notes],
			exampleIds,
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
			questions: storyQuestions,
		},
		ruleOrder,
		rules,
		examples,
		questions,
	};
}

export function toDocument(board: BoardState): ExampleMapDocument {
	const question = (id: Id): QuestionNode[] => {
		const card = board.questions[id];
		return card ? [{ title: card.title, notes: [...card.notes] }] : [];
	};

	return {
		title: board.title,
		product: board.product,
		space: board.space,
		notes: [...board.notes],
		story: {
			title: board.story.title,
			notes: [...board.story.notes],
			ticket: board.story.ticket,
			status: board.story.status,
			questions: board.story.questions.flatMap(question),
		},
		rules: board.ruleOrder.flatMap((ruleId) => {
			const rule = board.rules[ruleId];
			if (!rule) return [];
			return [
				{
					title: rule.title,
					notes: [...rule.notes],
					examples: rule.exampleIds.flatMap((id) => {
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
								given: written('given'),
								when: written('when'),
								then: written('then'),
							},
						];
					}),
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
