/**
 * The board model — an example map as the UI needs it.
 *
 * Normalised, with generated ids, like doc-sm's. The shape is simpler because
 * the technique is: there is one story, rules are a list, and an example or a
 * question belongs to exactly one parent. No cells, no bands — nothing here is
 * two-dimensional, because an example map is not.
 *
 * Ids are in-memory only. They are never written to an `.examplemap` file and
 * are regenerated on every import; nothing outside this tab refers to them.
 */

import type { CardKind } from '../examplemap/model.ts';

export type { CardKind };
export type Id = string;

export interface Card {
	readonly id: Id;
	readonly title: string;
	readonly notes: readonly string[];
}

export interface Rule extends Card {
	readonly exampleIds: readonly Id[];
	/** Questions raised while discussing this rule, in the order they were asked. */
	readonly questionIds: readonly Id[];
}

/**
 * The story. Singular, and not in a record.
 *
 * It has no id because there is only ever one of it — an id would exist solely
 * to look the thing up, and there is nothing to look it up among.
 */
export interface Story {
	readonly title: string;
	readonly notes: readonly string[];
	readonly questions: readonly Id[];
}

export interface BoardState {
	readonly title: string;
	readonly notes: readonly string[];
	readonly story: Story;
	readonly ruleOrder: readonly Id[];
	readonly rules: Readonly<Record<Id, Rule>>;
	readonly examples: Readonly<Record<Id, Card>>;
	readonly questions: Readonly<Record<Id, Card>>;
}

export function emptyBoard(title = 'Untitled example map', story = 'To be defined'): BoardState {
	return {
		title,
		notes: [],
		story: { title: story, notes: [], questions: [] },
		ruleOrder: [],
		rules: {},
		examples: {},
		questions: {},
	};
}

/** The rule a question belongs to, or undefined when it is the story's. */
export function ruleOfQuestion(board: BoardState, questionId: Id): Rule | undefined {
	for (const id of board.ruleOrder) {
		const rule = board.rules[id];
		if (rule?.questionIds.includes(questionId)) return rule;
	}
	return undefined;
}

export function ruleOfExample(board: BoardState, exampleId: Id): Rule | undefined {
	for (const id of board.ruleOrder) {
		const rule = board.rules[id];
		if (rule?.exampleIds.includes(exampleId)) return rule;
	}
	return undefined;
}

/** Every card that has a note, plus the story, which always has something to show. */
export function cardsWithDetail(board: BoardState): readonly Id[] {
	const found: Id[] = [];
	for (const [id, rule] of Object.entries(board.rules)) if (rule.notes.length > 0) found.push(id);
	for (const [id, card] of Object.entries(board.examples)) if (card.notes.length > 0) found.push(id);
	for (const [id, card] of Object.entries(board.questions)) if (card.notes.length > 0) found.push(id);
	return found;
}
