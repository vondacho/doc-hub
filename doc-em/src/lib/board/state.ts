/**
 * The board model — an example map as the UI needs it.
 *
 * Normalised, with generated ids, like doc-sm's.
 *
 * This module used to say, in as many words, that nothing here is
 * two-dimensional because an example map is not. That was true of the technique
 * and stopped being true of the tool the moment deliveries arrived: a rule is
 * still the column an example belongs to, and now a sprint is the row it ships
 * in. So the grid is doc-sm's, for the reason doc-sm gives.
 *
 * ## The load-bearing decision: an example has no delivery field
 *
 * `Example` carries no `deliveryId`. The cell it sits in *is* its assignment,
 * and `cells` is the only place that fact is written down.
 *
 * The alternative — a field on the example *and* a per-cell order array — is two
 * representations of one fact, and two representations are an invariant that
 * some reducer branch nobody re-read eventually violates. Deriving the
 * `@delivery` tag from the cell key at export time means a corrupt export is not
 * reachable, rather than merely unlikely.
 *
 * It is also the shape dnd-kit's multi-container sorting wants: one
 * SortableContext per cell, and a move is a splice out of one array and a splice
 * into another.
 *
 * The story is the exception and keeps a plain `release` field, because there is
 * exactly one story and it is not in the grid. With no cell there is no second
 * representation to disagree with, and the argument above does not apply.
 *
 * Ids are in-memory only. They are never written to an `.examplemap` file and
 * are regenerated on every import; nothing outside this tab refers to them.
 */

import {
	DEFAULT_STORY_STATUS,
	hasSteps,
	UNDEFINED_STORY,
	type CardKind,
	type DeliveryKind,
	type StepClause,
	type StoryStatus,
} from '../examplemap/model.ts';

export type { CardKind, DeliveryKind, StepClause };
export type Id = string;

/**
 * The below-the-line band: examples that are agreed and not committed to.
 *
 * A sentinel rather than a real delivery, because it is not one — it cannot be
 * renamed, reordered or deleted, and it is always last. `null` would work until
 * it had to be part of a `CellKey`, which is a string.
 */
export const UNSCHEDULED = '~';
export type BandId = Id | typeof UNSCHEDULED;

/** `${ruleId}|${bandId}`. Ids never contain `|` — they are `r1`, `e4`, `d2`. */
export type CellKey = string;

export function cellKey(ruleId: Id, band: BandId): CellKey {
	return `${ruleId}|${band}`;
}

export function splitCellKey(key: CellKey): { ruleId: Id; band: BandId } {
	const separator = key.indexOf('|');
	return { ruleId: key.slice(0, separator), band: key.slice(separator + 1) };
}

/** A sprint or a release — one row of the board. */
export interface Delivery {
	readonly id: Id;
	readonly title: string;
	readonly kind: DeliveryKind;
	readonly notes: readonly string[];
}

export interface Card {
	readonly id: Id;
	readonly title: string;
	readonly notes: readonly string[];
}

/**
 * An example, which is a card plus the scenario it stands for.
 *
 * The three buckets may hold an empty string, and that is not the same as not
 * holding it: an empty entry is a step line somebody opened from the menu and
 * has not written yet. It renders as a placeholder, and `toDocument` drops it —
 * so it never reaches the file, and re-importing does not resurrect it.
 */
export interface Example extends Card {
	readonly given: readonly string[];
	readonly when: readonly string[];
	readonly then: readonly string[];
}

export interface Rule extends Card {
	/**
	 * Questions raised while discussing this rule, in the order they were asked.
	 *
	 * Not banded, unlike the examples beside them. A question is not delivered —
	 * it is answered, and usually before anything ships — so it hangs on the rule
	 * itself and sits in the rule's header rather than in any row.
	 */
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
	/** The linked ticket, exactly as the tracker spells it. Read-only here. */
	readonly ticket: string | null;
	readonly status: StoryStatus;
	/**
	 * The delivery the story ships in, or null for one nobody has committed to.
	 *
	 * A field, where an example has a cell. The story is not in the grid — there
	 * is one of it and it spans the width — so there is no cell to carry the fact
	 * and no second copy to disagree with.
	 */
	readonly release: Id | null;
	readonly questions: readonly Id[];
}

export interface BoardState {
	readonly title: string;
	/** The registered product's shortname, or null for a map about no product. */
	readonly product: string | null;
	/** The stated ticketing space; null falls back to the product shortname. */
	readonly space: string | null;
	readonly notes: readonly string[];
	readonly story: Story;
	/** The timeline, earliest first. Order is the only statement of sequence. */
	readonly deliveryOrder: readonly Id[];
	readonly deliveries: Readonly<Record<Id, Delivery>>;
	readonly ruleOrder: readonly Id[];
	readonly rules: Readonly<Record<Id, Rule>>;
	readonly examples: Readonly<Record<Id, Example>>;
	/**
	 * Which examples sit where: `${ruleId}|${bandId}` to an ordered list.
	 *
	 * The single record of both a rule's examples and their delivery — see the
	 * note at the top of this file. A missing key is an empty cell; cells are not
	 * pre-created for every (rule × band) pair, because most of them are empty on
	 * any real board and materialising them would make an import quadratic in the
	 * size of the grid rather than linear in the number of cards.
	 */
	readonly cells: Readonly<Record<CellKey, readonly Id[]>>;
	readonly questions: Readonly<Record<Id, Card>>;
}

export function emptyBoard(title = 'Untitled example map', story = UNDEFINED_STORY): BoardState {
	return {
		title,
		product: null,
		space: null,
		notes: [],
		story: { title: story, notes: [], ticket: null, status: DEFAULT_STORY_STATUS, release: null, questions: [] },
		deliveryOrder: [],
		deliveries: {},
		ruleOrder: [],
		rules: {},
		examples: {},
		cells: {},
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
		if (examplesOfRule(board, id).includes(exampleId)) return board.rules[id];
	}
	return undefined;
}

/**
 * Every band, top to bottom, with the unscheduled one last.
 *
 * Last and not first: the board reads as a timeline, and what has not been
 * committed to has not happened yet. doc-sm draws the same conclusion and calls
 * it below the line.
 */
export function bands(board: BoardState): readonly BandId[] {
	return [...board.deliveryOrder, UNSCHEDULED];
}

/** The examples in one cell, in the order they were placed. */
export function examplesIn(board: BoardState, ruleId: Id, band: BandId): readonly Id[] {
	return board.cells[cellKey(ruleId, band)] ?? [];
}

/**
 * Every example under a rule, read down the timeline.
 *
 * Band order, then position within the band — so "the examples of this rule" has
 * one meaning, and it is the one somebody reading the column sees. Everything
 * that used to walk `rule.exampleIds` walks this instead: the counts in
 * `reading.ts`, the Gherkin writer's scenario order, and the export.
 */
export function examplesOfRule(board: BoardState, ruleId: Id): readonly Id[] {
	return bands(board).flatMap((band) => examplesIn(board, ruleId, band));
}

/** The cell an example is in, or undefined when the board has lost it. */
export function cellOfExample(board: BoardState, exampleId: Id): CellKey | undefined {
	for (const [key, ids] of Object.entries(board.cells)) {
		if (ids.includes(exampleId)) return key;
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
	// Every example, written steps or not: an example always has a scenario to
	// show, even if that scenario is still the Given/When/Then template. This is
	// the one kind where "expand" reveals something on a card nobody has typed
	// into — the same way every story in doc-sm shows its As/I want/So that.
	for (const id of Object.keys(board.examples)) found.push(id);
	for (const [id, card] of Object.entries(board.questions)) if (card.notes.length > 0) found.push(id);
	return found;
}

/** Whether this example has a scenario written, as opposed to only a title. */
export function exampleIsWritten(example: Example): boolean {
	return hasSteps(example);
}
