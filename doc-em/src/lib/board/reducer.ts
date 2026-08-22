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

import {
	DEFAULT_STORY_STATUS,
	splitNotes,
	UNDEFINED_STORY,
	type CardKind,
	type DeliveryKind,
	type StepClause,
	type StoryStatus,
} from '../examplemap/model.ts';
import { nextId } from './convert.ts';
import {
	cellKey,
	cellOfExample,
	splitCellKey,
	UNSCHEDULED,
	type BandId,
	type BoardState,
	type Card,
	type CellKey,
	type Example,
	type Id,
	type Rule,
} from './state.ts';

/** Where a question hangs. The story, or one rule. */
export type QuestionParent = { readonly story: true } | { readonly ruleId: Id };

export type BoardAction =
	| { type: 'import'; board: BoardState }
	/** Edited preview text: replaces the board but keeps the undo history. */
	| { type: 'applyText'; board: BoardState }
	| { type: 'reset' }
	| { type: 'setMapTitle'; title: string }
	/**
	 * Pick the registered product, or clear it.
	 *
	 * Setting a product *initialises* the ticketing space when none has been
	 * stated, which saves typing the same word twice in the case where they
	 * agree — the usual one. It never overwrites a space that already holds a
	 * value: changing the product later leaves a settled space alone, because a
	 * ticket already raised into it carries a key from it, and quietly
	 * re-pointing the map at another space would strand it.
	 */
	| { type: 'setProduct'; product: string | null }
	| { type: 'setSpace'; space: string | null }
	/**
	 * Record a status against the story.
	 *
	 * The one ticketing field the board may write. The id beside it is
	 * deliberately not here — see `Story.ticket` in state.ts — so there is no
	 * action that changes it and no component that could offer one by mistake.
	 */
	| { type: 'setStoryStatus'; status: StoryStatus }
	| { type: 'retitle'; kind: CardKind; id: Id; title: string }
	| { type: 'setNotes'; kind: CardKind; id: Id; text: string }
	| { type: 'addRule'; index: number }
	/** The band is where the `+` was clicked; a new example is born scheduled. */
	| { type: 'addExample'; ruleId: Id; band: BandId }
	| { type: 'addDelivery'; kind: DeliveryKind; index: number }
	| { type: 'retitleDelivery'; id: Id; title: string }
	| { type: 'setDeliveryKind'; id: Id; kind: DeliveryKind }
	/** Size a sprint. `null` un-sizes it, which is not the same as sizing it 0. */
	| { type: 'setDeliveryPoints'; id: Id; points: number | null }
	| { type: 'setDeliveryNotes'; id: Id; text: string }
	/**
	 * Delete a band. Its examples are not deleted with it — they fall below the
	 * line, which is what cancelling a sprint actually does to the work in it.
	 */
	| { type: 'removeDelivery'; id: Id }
	| { type: 'moveDelivery'; id: Id; index: number }
	/** Which band the story ships in. `null` puts it back to uncommitted. */
	| { type: 'setStoryRelease'; release: Id | null }
	/** Open a step line on an example. The line starts empty; the author fills it. */
	| { type: 'addStep'; exampleId: Id; clause: StepClause }
	/** Write one step. Blank text deletes the line rather than storing nothing. */
	| { type: 'setStep'; exampleId: Id; clause: StepClause; index: number; text: string }
	| { type: 'addQuestion'; parent: QuestionParent }
	| { type: 'remove'; kind: Exclude<CardKind, 'story'>; id: Id }
	| { type: 'moveRule'; ruleId: Id; index: number }
	/** A drag between cells: rule and band may each change, independently. */
	| { type: 'moveExample'; exampleId: Id; from: CellKey; to: CellKey; index: number }
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
				product: null,
				space: null,
				notes: [],
				// A board always has a story, even a blank one: a session that has
				// not named its story has not started.
				story: { title: UNDEFINED_STORY, notes: [], ticket: null, status: DEFAULT_STORY_STATUS, release: null, questions: [] },
				deliveryOrder: [],
				deliveries: {},
				ruleOrder: [],
				rules: {},
				examples: {},
				cells: {},
				questions: {},
			};

		case 'setMapTitle':
			return action.title.trim() === '' || action.title === board.title
				? board
				: { ...board, title: action.title };

		case 'setProduct': {
			if (action.product === board.product) return board;
			// Initialised, not derived: once it holds a value it is the map's own.
			const space = board.space ?? action.product;
			return { ...board, product: action.product, space };
		}

		case 'setSpace': {
			// Blank and "follow the product" are the same intent, so an emptied
			// field returns the space to null rather than storing "".
			const space = action.space === null || action.space.trim() === '' ? null : action.space.trim();
			return space === board.space ? board : { ...board, space };
		}

		case 'setStoryStatus':
			return action.status === board.story.status
				? board
				: { ...board, story: { ...board.story, status: action.status } };

		case 'retitle':
			return retitle(board, action.kind, action.id, action.title);

		case 'setNotes':
			return setNotes(board, action.kind, action.id, action.text);

		case 'addRule': {
			const id = nextId('r');
			return {
				...board,
				rules: { ...board.rules, [id]: { id, title: 'New rule', notes: [], questionIds: [] } },
				ruleOrder: insertAt(board.ruleOrder, action.index, id),
			};
		}

		case 'addExample': {
			const rule = board.rules[action.ruleId];
			if (!rule) return board;
			const id = nextId('e');
			const key = cellKey(action.ruleId, action.band);
			return {
				...board,
				examples: {
					...board.examples,
					// No steps, not empty ones: a new example shows the Given/When/Then
					// template because `stepLines` supplies it, and the card stays a
					// title until somebody makes it precise.
					[id]: { id, title: 'New example', notes: [], given: [], when: [], then: [] },
				},
				cells: { ...board.cells, [key]: [...(board.cells[key] ?? []), id] },
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
			return moveExample(board, action.exampleId, action.from, action.to, action.index);

		case 'addDelivery': {
			const id = nextId('d');
			const title = freshDeliveryTitle(board, action.kind);
			return {
				...board,
				// No ticket: a band added here is a plan, and a plan exists before the
				// tracker knows about it. Linking one is an edit to the file.
				deliveries: {
					...board.deliveries,
					[id]: { id, title, kind: action.kind, ticket: null, points: null, notes: [] },
				},
				deliveryOrder: insertAt(board.deliveryOrder, action.index, id),
			};
		}

		case 'retitleDelivery': {
			const delivery = board.deliveries[action.id];
			const title = action.title.trim();
			// A band with no name cannot be referred to in the file, so an emptied
			// title is refused rather than written. Same rule the card titles follow.
			if (!delivery || title === '' || title === delivery.title) return board;
			return { ...board, deliveries: { ...board.deliveries, [action.id]: { ...delivery, title } } };
		}

		case 'setDeliveryKind': {
			const delivery = board.deliveries[action.id];
			if (!delivery || delivery.kind === action.kind) return board;
			// Only a sprint is sized, so becoming a release drops the estimate. The
			// alternative is a hidden number that reappears if the band is switched
			// back — which is worse than losing it, because nobody would know it was
			// still there, and the file cannot express it either way.
			const points = action.kind === 'sprint' ? delivery.points : null;
			return {
				...board,
				deliveries: { ...board.deliveries, [action.id]: { ...delivery, kind: action.kind, points } },
			};
		}

		case 'setDeliveryPoints': {
			const delivery = board.deliveries[action.id];
			if (!delivery || delivery.kind !== 'sprint' || delivery.points === action.points) return board;
			return {
				...board,
				deliveries: { ...board.deliveries, [action.id]: { ...delivery, points: action.points } },
			};
		}

		case 'setDeliveryNotes': {
			const delivery = board.deliveries[action.id];
			if (!delivery) return board;
			const notes = splitNotes(action.text);
			return { ...board, deliveries: { ...board.deliveries, [action.id]: { ...delivery, notes } } };
		}

		case 'removeDelivery':
			return removeDelivery(board, action.id);

		case 'moveDelivery': {
			const reordered = moveWithin(board.deliveryOrder, action.id, action.index);
			return reordered === board.deliveryOrder ? board : { ...board, deliveryOrder: reordered };
		}

		case 'setStoryRelease':
			return action.release === board.story.release
				? board
				: { ...board, story: { ...board.story, release: action.release } };

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

		// The rule's examples live in its column of cells, one per band, so both
		// the cards and the cells that held them go.
		const examples = { ...board.examples };
		const cells = { ...board.cells };
		for (const [key, ids] of Object.entries(board.cells)) {
			if (splitCellKey(key).ruleId !== id) continue;
			for (const exampleId of ids) delete examples[exampleId];
			delete cells[key];
		}

		const questions = { ...board.questions };
		for (const questionId of rule.questionIds) delete questions[questionId];

		return { ...board, rules, examples, cells, questions, ruleOrder: board.ruleOrder.filter((r) => r !== id) };
	}

	if (kind === 'example') {
		if (!board.examples[id]) return board;
		const examples = { ...board.examples };
		delete examples[id];
		const key = cellOfExample(board, id);
		const cells = { ...board.cells };
		if (key !== undefined) cells[key] = (cells[key] ?? []).filter((e) => e !== id);
		return { ...board, examples, cells };
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

/**
 * A drag from one cell to another — which is how an example is both re-filed
 * under a different rule and scheduled into a different sprint.
 *
 * One operation for both, because on this board they are one gesture. Moving
 * sideways changes which rule an example illustrates; moving down changes when
 * it ships; moving diagonally does both, and there is no reading under which
 * that should need two undo steps.
 */
function moveExample(board: BoardState, id: Id, from: CellKey, to: CellKey, index: number): BoardState {
	const source = board.cells[from];
	if (!source?.includes(id)) return board;

	// The target rule must exist; the target band need not be a real delivery,
	// because UNSCHEDULED is a band and is not in `deliveries`.
	const { ruleId } = splitCellKey(to);
	if (!board.rules[ruleId]) return board;

	if (from === to) {
		const reordered = moveWithin(source, id, index);
		return reordered === source ? board : { ...board, cells: { ...board.cells, [from]: reordered } };
	}

	return {
		...board,
		cells: {
			...board.cells,
			[from]: source.filter((e) => e !== id),
			[to]: insertAt(board.cells[to] ?? [], index, id),
		},
	};
}

/**
 * Delete a band, and let the work in it fall below the line.
 *
 * Not delete the work with it. Cancelling a sprint does not cancel what was
 * planned into it — that work goes back to being agreed and unscheduled, which
 * is exactly what the unscheduled band means. Deleting the cards too would make
 * removing a band the most destructive control on the board, and it would be
 * destructive in a way nobody expects from a row header.
 *
 * The story falls back to uncommitted the same way if it shipped in this band.
 */
function removeDelivery(board: BoardState, id: Id): BoardState {
	if (!board.deliveries[id]) return board;

	const deliveries = { ...board.deliveries };
	delete deliveries[id];

	const cells = { ...board.cells };
	for (const [key, ids] of Object.entries(board.cells)) {
		const { ruleId, band } = splitCellKey(key);
		if (band !== id) continue;
		delete cells[key];
		if (ids.length === 0) continue;
		const target = cellKey(ruleId, UNSCHEDULED);
		cells[target] = [...(cells[target] ?? []), ...ids];
	}

	return {
		...board,
		deliveries,
		deliveryOrder: board.deliveryOrder.filter((d) => d !== id),
		cells,
		story: board.story.release === id ? { ...board.story, release: null } : board.story,
	};
}

/**
 * `Sprint 3`, or the next number after the sprints that already exist.
 *
 * A new band needs a title that is not already taken, because titles are how the
 * file refers to a band and duplicates are a parse error. Counting the existing
 * ones of the same kind gets the obvious answer nearly always, and the author
 * renames it when it does not.
 */
function freshDeliveryTitle(board: BoardState, kind: DeliveryKind): string {
	const taken = new Set(Object.values(board.deliveries).map((delivery) => delivery.title));
	const stem = kind === 'sprint' ? 'Sprint' : 'Release';
	for (let n = Object.values(board.deliveries).filter((d) => d.kind === kind).length + 1; ; n += 1) {
		const candidate = `${stem} ${n}`;
		if (!taken.has(candidate)) return candidate;
	}
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
