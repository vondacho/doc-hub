/**
 * Every change the board can make, as one pure function.
 *
 * Imports nothing from React. This file is the tool; the island is a way to
 * drive it — the same separation doc-sm draws, and the reason both can be
 * exercised from a shell script before any component exists.
 *
 * A reducer that declines to act returns the *same object*, because history.ts
 * uses an identity check to decide whether an action consumed an undo step.
 */

import { splitNotes, UNDEFINED_STORY, type CardKind, type StepClause } from '../examplemap/model.ts';
import { nextId } from './convert.ts';
import type { BoardState, Card, Example, Id, Rule } from './state.ts';

/** Where a question hangs. The story, or one rule. */
export type QuestionParent = { readonly story: true } | { readonly ruleId: Id };

export type BoardAction =
	| { type: 'import'; board: BoardState }
	/** Edited preview text: replaces the board but keeps the undo history. */
	| { type: 'applyText'; board: BoardState }
	| { type: 'reset' }
	| { type: 'setMapTitle'; title: string }
	| { type: 'retitle'; kind: CardKind; id: Id; title: string }
	| { type: 'setNotes'; kind: CardKind; id: Id; text: string }
	| { type: 'addRule'; index: number }
	| { type: 'addExample'; ruleId: Id }
	/** Open a step line on an example. The line starts empty; the author fills it. */
	| { type: 'addStep'; exampleId: Id; clause: StepClause }
	/** Write one step. Blank text deletes the line rather than storing nothing. */
	| { type: 'setStep'; exampleId: Id; clause: StepClause; index: number; text: string }
	| { type: 'addQuestion'; parent: QuestionParent }
	| { type: 'remove'; kind: Exclude<CardKind, 'story'>; id: Id }
	| { type: 'moveRule'; ruleId: Id; index: number }
	| { type: 'moveExample'; exampleId: Id; fromRuleId: Id; toRuleId: Id; index: number }
	| { type: 'moveQuestion'; questionId: Id; from: QuestionParent; to: QuestionParent; index: number };

/** Actions that open a different document; history.ts clears on these. */
export function resetsHistory(action: BoardAction): boolean {
	return action.type === 'import' || action.type === 'reset';
}

export function reduce(board: BoardState, action: BoardAction): BoardState {
	switch (action.type) {
		case 'import':
		case 'applyText':
			return action.board;

		case 'reset':
			return {
				...board,
				notes: [],
				// A board always has a story, even a blank one: a session that has
				// not named its story has not started.
				story: { title: UNDEFINED_STORY, notes: [], questions: [] },
				ruleOrder: [],
				rules: {},
				examples: {},
				questions: {},
			};

		case 'setMapTitle':
			return action.title.trim() === '' || action.title === board.title
				? board
				: { ...board, title: action.title };

		case 'retitle':
			return retitle(board, action.kind, action.id, action.title);

		case 'setNotes':
			return setNotes(board, action.kind, action.id, action.text);

		case 'addRule': {
			const id = nextId('r');
			return {
				...board,
				rules: { ...board.rules, [id]: { id, title: 'New rule', notes: [], exampleIds: [], questionIds: [] } },
				ruleOrder: insertAt(board.ruleOrder, action.index, id),
			};
		}

		case 'addExample': {
			const rule = board.rules[action.ruleId];
			if (!rule) return board;
			const id = nextId('e');
			return {
				...board,
				examples: {
					...board.examples,
					// No steps, not empty ones: a new example shows the Given/When/Then
					// template because `stepLines` supplies it, and the card stays a
					// title until somebody makes it precise.
					[id]: { id, title: 'New example', notes: [], given: [], when: [], then: [] },
				},
				rules: { ...board.rules, [rule.id]: { ...rule, exampleIds: [...rule.exampleIds, id] } },
			};
		}

		case 'addStep':
			return addStep(board, action.exampleId, action.clause);

		case 'setStep':
			return setStep(board, action.exampleId, action.clause, action.index, action.text);

		case 'addQuestion': {
			const id = nextId('q');
			const card: Card = { id, title: 'New question', notes: [] };
			if ('story' in action.parent) {
				return {
					...board,
					questions: { ...board.questions, [id]: card },
					story: { ...board.story, questions: [...board.story.questions, id] },
				};
			}
			const rule = board.rules[action.parent.ruleId];
			if (!rule) return board;
			return {
				...board,
				questions: { ...board.questions, [id]: card },
				rules: { ...board.rules, [rule.id]: { ...rule, questionIds: [...rule.questionIds, id] } },
			};
		}

		case 'remove':
			return remove(board, action.kind, action.id);

		case 'moveRule': {
			const order = moveWithin(board.ruleOrder, action.ruleId, action.index);
			return order === board.ruleOrder ? board : { ...board, ruleOrder: order };
		}

		case 'moveExample':
			return moveExample(board, action.exampleId, action.fromRuleId, action.toRuleId, action.index);

		case 'moveQuestion':
			return moveQuestion(board, action.questionId, action.from, action.to, action.index);
	}
}

/* -------------------------------------------------------------------------- */

/**
 * Open one more line of a clause.
 *
 * Appends an empty string, which is how the board says "this line exists and is
 * waiting". The first `Given` is not appended by this — `stepLines` already
 * renders a template line for an empty clause, so opening a clause that has
 * nothing in it would produce two placeholders where the author expects one.
 */
function addStep(board: BoardState, id: Id, clause: StepClause): BoardState {
	const example = board.examples[id];
	if (!example) return board;
	// A trailing blank is already the line being waited on; a second helps nobody.
	if (example[clause].at(-1)?.trim() === '') return board;
	return withSteps(board, example, clause, [...example[clause], '']);
}

/**
 * Write one step, by index within its clause.
 *
 * Blank text removes the line. That is the only way to delete a step, and it is
 * the obvious one: clearing the words of a step you did not mean to add is what
 * a person tries first. An index past the end appends, so the template line that
 * `stepLines` renders for an empty clause commits into the first real entry.
 */
function setStep(
	board: BoardState,
	id: Id,
	clause: StepClause,
	index: number,
	raw: string,
): BoardState {
	const example = board.examples[id];
	if (!example) return board;

	// A step is one line of a scenario. Pasted breaks are collapsed rather than
	// written into a feature file that would then fail to parse.
	const text = raw.replace(/\s+/g, ' ').trim();
	const current = example[clause];

	if (index >= current.length) {
		return text === '' ? board : withSteps(board, example, clause, [...current, text]);
	}
	if (current[index] === text) return board;

	const next = text === ''
		? [...current.slice(0, index), ...current.slice(index + 1)]
		: current.map((step, at) => (at === index ? text : step));
	return withSteps(board, example, clause, next);
}

function withSteps(
	board: BoardState,
	example: Example,
	clause: StepClause,
	steps: readonly string[],
): BoardState {
	return {
		...board,
		examples: { ...board.examples, [example.id]: { ...example, [clause]: steps } },
	};
}

function retitle(board: BoardState, kind: CardKind, id: Id, raw: string): BoardState {
	const title = raw.trim();
	if (title === '') return board;

	if (kind === 'story') {
		return title === board.story.title ? board : { ...board, story: { ...board.story, title } };
	}
	if (kind === 'rule') {
		const rule = board.rules[id];
		if (!rule || rule.title === title) return board;
		return { ...board, rules: { ...board.rules, [id]: { ...rule, title } } };
	}
	// Examples and questions are handled apart rather than through one `bag`.
	// They were the same shape until an example grew its three step buckets, and
	// a shared local widens back to `Card` — which then loses them on every
	// rename.
	if (kind === 'example') {
		const card = board.examples[id];
		if (!card || card.title === title) return board;
		return { ...board, examples: { ...board.examples, [id]: { ...card, title } } };
	}
	const card = board.questions[id];
	if (!card || card.title === title) return board;
	return { ...board, questions: { ...board.questions, [id]: { ...card, title } } };
}

function setNotes(board: BoardState, kind: CardKind, id: Id, text: string): BoardState {
	const notes = splitNotes(text);
	const same = (existing: readonly string[]) =>
		existing.length === notes.length && existing.every((note, i) => note === notes[i]);

	if (kind === 'story') {
		return same(board.story.notes) ? board : { ...board, story: { ...board.story, notes } };
	}
	if (kind === 'rule') {
		const rule = board.rules[id];
		if (!rule || same(rule.notes)) return board;
		return { ...board, rules: { ...board.rules, [id]: { ...rule, notes } } };
	}
	if (kind === 'example') {
		const card = board.examples[id];
		if (!card || same(card.notes)) return board;
		return { ...board, examples: { ...board.examples, [id]: { ...card, notes } } };
	}
	const card = board.questions[id];
	if (!card || same(card.notes)) return board;
	return { ...board, questions: { ...board.questions, [id]: { ...card, notes } } };
}

/**
 * Deleting a rule takes its examples and questions with it.
 *
 * They have nowhere else to be: an example illustrates *that* rule, and a
 * question raised about it stops meaning anything once the rule is gone.
 */
function remove(board: BoardState, kind: Exclude<CardKind, 'story'>, id: Id): BoardState {
	if (kind === 'rule') {
		const rule = board.rules[id];
		if (!rule) return board;

		const rules = { ...board.rules };
		delete rules[id];
		const examples = { ...board.examples };
		for (const exampleId of rule.exampleIds) delete examples[exampleId];
		const questions = { ...board.questions };
		for (const questionId of rule.questionIds) delete questions[questionId];

		return { ...board, rules, examples, questions, ruleOrder: board.ruleOrder.filter((r) => r !== id) };
	}

	if (kind === 'example') {
		if (!board.examples[id]) return board;
		const examples = { ...board.examples };
		delete examples[id];
		return {
			...board,
			examples,
			rules: mapRules(board, (rule) => ({ ...rule, exampleIds: rule.exampleIds.filter((e) => e !== id) })),
		};
	}

	if (!board.questions[id]) return board;
	const questions = { ...board.questions };
	delete questions[id];
	return {
		...board,
		questions,
		story: { ...board.story, questions: board.story.questions.filter((q) => q !== id) },
		rules: mapRules(board, (rule) => ({ ...rule, questionIds: rule.questionIds.filter((q) => q !== id) })),
	};
}

function moveExample(board: BoardState, id: Id, fromId: Id, toId: Id, index: number): BoardState {
	const from = board.rules[fromId];
	const to = board.rules[toId];
	if (!from || !to || !from.exampleIds.includes(id)) return board;

	if (fromId === toId) {
		const reordered = moveWithin(from.exampleIds, id, index);
		if (reordered === from.exampleIds) return board;
		return { ...board, rules: { ...board.rules, [fromId]: { ...from, exampleIds: reordered } } };
	}

	return {
		...board,
		rules: {
			...board.rules,
			[fromId]: { ...from, exampleIds: from.exampleIds.filter((e) => e !== id) },
			[toId]: { ...to, exampleIds: insertAt(to.exampleIds, index, id) },
		},
	};
}

/**
 * A question can move between a rule and the story, and back.
 *
 * That is not tidying: it is the session realising that a doubt it thought was
 * about one rule is really about the story, or the reverse. The move is the
 * finding.
 */
function moveQuestion(
	board: BoardState,
	id: Id,
	from: QuestionParent,
	to: QuestionParent,
	index: number,
): BoardState {
	const holds = 'story' in from ? board.story.questions.includes(id) : board.rules[from.ruleId]?.questionIds.includes(id);
	if (holds !== true) return board;
	if ('ruleId' in to && !board.rules[to.ruleId]) return board;

	const sameParent =
		('story' in from && 'story' in to) ||
		('ruleId' in from && 'ruleId' in to && from.ruleId === to.ruleId);

	if (sameParent) {
		if ('story' in to) {
			const reordered = moveWithin(board.story.questions, id, index);
			return reordered === board.story.questions
				? board
				: { ...board, story: { ...board.story, questions: reordered } };
		}
		const rule = board.rules[to.ruleId]!;
		const reordered = moveWithin(rule.questionIds, id, index);
		return reordered === rule.questionIds
			? board
			: { ...board, rules: { ...board.rules, [rule.id]: { ...rule, questionIds: reordered } } };
	}

	let next: BoardState = {
		...board,
		story:
			'story' in from
				? { ...board.story, questions: board.story.questions.filter((q) => q !== id) }
				: board.story,
		rules:
			'ruleId' in from
				? {
						...board.rules,
						[from.ruleId]: {
							...board.rules[from.ruleId]!,
							questionIds: board.rules[from.ruleId]!.questionIds.filter((q) => q !== id),
						},
					}
				: board.rules,
	};

	if ('story' in to) {
		next = { ...next, story: { ...next.story, questions: insertAt(next.story.questions, index, id) } };
	} else {
		const rule = next.rules[to.ruleId]!;
		next = {
			...next,
			rules: { ...next.rules, [rule.id]: { ...rule, questionIds: insertAt(rule.questionIds, index, id) } },
		};
	}
	return next;
}

/* -------------------------------------------------------------------------- */

function mapRules(board: BoardState, f: (rule: Rule) => Rule): Record<Id, Rule> {
	const out: Record<Id, Rule> = {};
	for (const [id, rule] of Object.entries(board.rules)) out[id] = f(rule);
	return out;
}

function insertAt<T>(list: readonly T[], index: number, item: T): readonly T[] {
	const at = Math.max(0, Math.min(index, list.length));
	return [...list.slice(0, at), item, ...list.slice(at)];
}

/** Move an item already in the list; the same object if it does not move. */
function moveWithin<T>(list: readonly T[], item: T, index: number): readonly T[] {
	const from = list.indexOf(item);
	if (from === -1) return list;
	const to = Math.max(0, Math.min(index, list.length - 1));
	if (from === to) return list;
	const rest = [...list.slice(0, from), ...list.slice(from + 1)];
	return [...rest.slice(0, to), item, ...rest.slice(to)];
}
