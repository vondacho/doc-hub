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

import type { ExampleMapDocument, QuestionNode } from '../examplemap/model.ts';
import {
	cellKey,
	emptyBoard,
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

/** `r1`, `e4`, `q7`, `d2` — the prefix makes a stray id readable in a log. */
/**
 * ## Ids are positions, and that is the whole design
 *
 * The text is the source of truth, and text has no id column. A card's identity
 * is therefore *where it is written*: `r2` is the third rule, `r2e0` its first
 * example, `d1` the second band. Questions carry their parent — `r2q0` is the
 * third rule's first question, `sq0` the story's.
 *
 * **A reparse yields the same id for a card nobody moved**, which is what lets
 * the board keep React keys, an open card menu and a drag in flight across the
 * keystroke-by-keystroke reparsing the editor pane causes.
 *
 * **An id decodes back to a position**, which is how a gesture finds the node
 * whose span it is about to splice — see `edit.ts`.
 *
 * The cost, accepted deliberately: ids shift when text above them changes.
 */

/** `d1` — the second band of the timeline. */
export function deliveryId(index: number): Id {
	return `d${index}`;
}

/** `r2` — the third rule, counting from the top of the file. */
export function ruleId(index: number): Id {
	return `r${index}`;
}

/** `r2e0` — the first example written under the third rule. */
export function exampleId(rule: number, example: number): Id {
	return `r${rule}e${example}`;
}

/** `r2q0` under a rule, `sq0` under the story. */
export function questionId(parent: number | 'story', index: number): Id {
	return parent === 'story' ? `sq${index}` : `r${parent}q${index}`;
}

/** Where an example is written, or null. */
export function examplePositionOf(id: Id): { rule: number; example: number } | null {
	const found = /^r(\d+)e(\d+)$/.exec(id);
	return found === null ? null : { rule: Number(found[1]), example: Number(found[2]) };
}

/** Where a question is written — under a rule, or under the story. */
export function questionPositionOf(id: Id): { rule: number | 'story'; question: number } | null {
	const story = /^sq(\d+)$/.exec(id);
	if (story) return { rule: 'story', question: Number(story[1]) };
	const found = /^r(\d+)q(\d+)$/.exec(id);
	return found === null ? null : { rule: Number(found[1]), question: Number(found[2]) };
}

/** Which rule an id names, or null. */
export function rulePositionOf(id: Id): number | null {
	const found = /^r(\d+)$/.exec(id);
	return found === null ? null : Number(found[1]);
}

/** Which delivery an id names, or null. */
export function deliveryPositionOf(id: Id): number | null {
	const found = /^d(\d+)$/.exec(id);
	return found === null ? null : Number(found[1]);
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
	document.deliveries.forEach((delivery, deliveryIndex) => {
		const id = deliveryId(deliveryIndex);
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
	});

	const addQuestions = (nodes: readonly QuestionNode[], parent: number | 'story'): Id[] =>
		nodes.map((node, index) => {
			const id = questionId(parent, index);
			questions[id] = { id, title: node.title, notes: [...node.notes], tags: [...node.tags] };
			return id;
		});

	const storyQuestions = addQuestions(document.story?.questions ?? [], 'story');

	document.rules.forEach((rule, ruleIndex) => {
		const rid = ruleId(ruleIndex);
		rule.examples.forEach((example, exampleIndex) => {
			const id = exampleId(ruleIndex, exampleIndex);
			examples[id] = {
				id,
				title: example.title,
				notes: [...example.notes],
				tags: [...example.tags],
				given: [...example.given],
				when: [...example.when],
				then: [...example.then],
			};
			// An unresolvable name cannot occur — the parser errors on one — so the
			// fallback is for `null`, which is the ordinary unscheduled case.
			const band: BandId = (example.delivery !== null ? bandOf.get(example.delivery) : undefined) ?? UNSCHEDULED;
			const key = cellKey(rid, band);
			(cells[key] ??= []).push(id);
		});
		rules[rid] = {
			id: rid,
			title: rule.title,
			notes: [...rule.notes],
			tags: [...rule.tags],
			questionIds: addQuestions(rule.questions, ruleIndex),
		};
		ruleOrder.push(rid);
	});

	return {
		...emptyBoard(document.title),
		notes: [...document.notes],
		product: document.product,
		space: document.space,
		story:
			document.story === null
				? null
				: {
						title: document.story.title,
						notes: [...document.story.notes],
						ticket: document.story.ticket,
						status: document.story.status,
						release:
							(document.story.release !== null ? bandOf.get(document.story.release) : undefined) ?? null,
						persona: document.story.persona,
						want: document.story.want,
						soThat: document.story.soThat,
						tags: [...document.story.tags],
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
