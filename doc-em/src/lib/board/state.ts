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

/**
 * The detail key of the story card.
 *
 * The story has no id — see `Story` above — but the expanded-cards set is keyed
 * by id, so it needs one name to be known by. A literal, exported rather than
 * spelled twice: the grid and `cardsWithDetail` have to agree on it, and the day
 * they silently disagree the global notes toggle skips the story and nothing
 * else looks wrong. Generated ids are prefixed `r`/`e`/`q`, so it cannot collide.
 */
export const STORY_DETAIL_KEY: Id = 'story';

/**
 * Every card that has a note, the story included.
 *
 * Not "every card": a card with no notes has no caret and nothing to reveal, so
 * counting it would make the global toggle claim to have expanded something it
 * did not. The story is a card like the others here — it is the one the session
 * is about, but that does not give it notes it has not been written.
 */
export function cardsWithDetail(board: BoardState): readonly Id[] {
	const found: Id[] = [];
	if (board.story.notes.length > 0) found.push(STORY_DETAIL_KEY);
	for (const [id, rule] of Object.entries(board.rules)) if (rule.notes.length > 0) found.push(id);
	for (const [id, card] of Object.entries(board.examples)) if (card.notes.length > 0) found.push(id);
	for (const [id, card] of Object.entries(board.questions)) if (card.notes.length > 0) found.push(id);
	return found;
}
