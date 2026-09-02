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
	hasSteps,
	tagKey,
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
	/**
	 * The band's ticket in the tracker, exactly as that system spells it.
	 *
	 * Read-only here, like the story's — see `DeliveryNode.ticket` in
	 * examplemap/model.ts. No reducer action writes it, which is what makes that
	 * guarantee structural rather than a rule somebody has to remember.
	 */
	readonly ticket: string | null;
	/**
	 * The sprint's size in story points, or null for one nobody has sized.
	 *
	 * Sprints only — see `DeliveryNode.points` in examplemap/model.ts for why a
	 * release is not sized, and for why this is a flat field rather than a
	 * discriminated union. Editable here, unlike the ticket beside it: an estimate
	 * is decided in the room, not issued by the tracker.
	 */
	readonly points: number | null;
	readonly notes: readonly string[];
}

export interface Card {
	readonly id: Id;
	readonly title: string;
	readonly notes: readonly string[];
	/**
	 * The card's free labels, in the order the file writes them.
	 *
	 * On `Card` rather than on each of the three that extend it, because every
	 * kind takes them — including the story, which is not a `Card` here only
	 * because it is singular and carries a need. See `tagKey` in the document
	 * model for what a tag is and why the vocabulary is open.
	 */
	readonly tags: readonly string[];
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
	/**
	 * The three clauses of the need, exactly as the file holds them.
	 *
	 * Free text, all three — see `StoryNode.persona` in examplemap/model.ts for
	 * why the persona is typed here and chosen from a list in doc-sm.
	 */
	readonly persona: string | null;
	readonly want: string | null;
	readonly soThat: string | null;
	readonly tags: readonly string[];
	readonly questions: readonly Id[];
}

export interface BoardState {
	readonly title: string;
	/** The registered product's shortname, or null for a map about no product. */
	readonly product: string | null;
	/** The stated ticketing space; null falls back to the product shortname. */
	readonly space: string | null;
	readonly notes: readonly string[];
	/**
	 * The story under discussion, or `null` before anybody has named one.
	 *
	 * Optional here for the reason it is optional in the file — see `StoryNode` in
	 * examplemap/model.ts. A board with no story and no rules shows the choice
	 * instead of a placeholder card.
	 */
	readonly story: Story | null;
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

export function emptyBoard(title = 'Untitled example map'): BoardState {
	return {
		title,
		product: null,
		space: null,
		notes: [],
		story: null,
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
/** One tag as the filter row offers it: how it is spelled, and how many wear it. */
export interface TagInUse {
	/** The first spelling seen, reading the map in board order. */
	readonly tag: string;
	/** What `tagKey` folds it to. The identity the filter actually matches on. */
	readonly key: string;
	readonly count: number;
}

/**
 * Every tag on the map, most-used first, with how many cards wear each.
 *
 * ## Folded by key, labelled by first spelling
 *
 * The parser refuses one card tagged `+Legal +legal`, but nothing stops *two*
 * cards spelling the same label differently — the check is per card, because
 * that is the scope in which a repeat means a bad merge. Here the two are one
 * tag with a count of two, since a filter that offered both would defeat the
 * only thing a tag is for.
 *
 * The label shown is the first spelling encountered, reading the map the way a
 * person does: the story, then each rule with its examples and questions. Not
 * the commonest, which would be more democratic and would also make the chip
 * rename itself as cards are added — a control whose text moves under the
 * reader is worse than one that picked a spelling and kept it.
 */
export function tagsInUse(board: BoardState): readonly TagInUse[] {
	const found = new Map<string, { tag: string; count: number }>();

	const add = (tags: readonly string[]) => {
		for (const tag of tags) {
			const key = tagKey(tag);
			const seen = found.get(key);
			if (seen === undefined) found.set(key, { tag, count: 1 });
			else seen.count += 1;
		}
	};

	if (board.story !== null) {
		add(board.story.tags);
		for (const id of board.story.questions) add(board.questions[id]?.tags ?? []);
	}

	for (const ruleId of board.ruleOrder) {
		const rule = board.rules[ruleId];
		if (rule === undefined) continue;
		add(rule.tags);
		for (const id of examplesOfRule(board, ruleId)) add(board.examples[id]?.tags ?? []);
		for (const id of rule.questionIds) add(board.questions[id]?.tags ?? []);
	}

	return [...found.entries()]
		.map(([key, { tag, count }]) => ({ tag, key, count }))
		.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/**
 * Which cards the filter is pointing at, or `null` when it is not on.
 *
 * `null` rather than "every id", because the two mean different things to the
 * caller: no filter is not the same as a filter that happens to match
 * everything, and only the first should leave the map undimmed.
 *
 * **A card matches if it wears *any* of the chosen tags.** Union, not
 * intersection. The question somebody asks a map is "where is the payments
 * work, and the legal work" — narrowing to cards that are both is a rarer thing
 * to want, and it is the one of the two that can silently answer "nowhere" and
 * look like a broken filter.
 *
 * ## A rule matches when anything under it does
 *
 * This is where the example map differs from the wall in doc-es, and it is the
 * containment that causes it. There every card is a peer. Here a rule is the
 * *heading of a column*, and its examples and questions hang beneath it — so
 * filtering for `+legal` and dimming the rule above a lit example would grey
 * out the heading of the very thing being pointed at. The column would read as
 * switched off while its contents read as switched on. The story behaves the
 * same way with the questions hanging off it.
 *
 * It does not run the other way. A tagged rule does not light its examples:
 * those are the specific things being looked for, and lighting all of them
 * would answer a question nobody asked.
 */
export function filtered(board: BoardState, keys: ReadonlySet<string>): ReadonlySet<Id> | null {
	if (keys.size === 0) return null;

	const wears = (tags: readonly string[]) => tags.some((tag) => keys.has(tagKey(tag)));
	const matching = new Set<Id>();

	if (board.story !== null) {
		let inStory = wears(board.story.tags);
		for (const id of board.story.questions) {
			if (!wears(board.questions[id]?.tags ?? [])) continue;
			matching.add(id);
			inStory = true;
		}
		if (inStory) matching.add(STORY_DETAIL_KEY);
	}

	for (const ruleId of board.ruleOrder) {
		const rule = board.rules[ruleId];
		if (rule === undefined) continue;
		let inRule = wears(rule.tags);

		for (const id of examplesOfRule(board, ruleId)) {
			if (!wears(board.examples[id]?.tags ?? [])) continue;
			matching.add(id);
			inRule = true;
		}
		for (const id of rule.questionIds) {
			if (!wears(board.questions[id]?.tags ?? [])) continue;
			matching.add(id);
			inRule = true;
		}

		if (inRule) matching.add(ruleId);
	}

	return matching;
}

export const STORY_DETAIL_KEY: Id = 'story';

/**
 * Every card that has a note, the story included.
 *
 * Not "every card": a rule or a question with no notes has no caret and nothing
 * to reveal, so counting it would make the global toggle claim to have expanded
 * something it did not.
 *
 * The story and the examples are the exceptions, and for the same reason: both
 * have something to show that nobody has typed — the story its need, an example
 * its Given/When/Then — rendered as a muted template. A card whose caret is
 * always there must always be counted here.
 */
export function cardsWithDetail(board: BoardState): readonly Id[] {
	const found: Id[] = [];
	// The story, always. It carries its need now, and `needLines` renders the
	// three clauses as a muted template even when none is written — so the card
	// always has a caret, and this has to agree with that or the global toggle
	// silently skips the one card the session is about.
	found.push(STORY_DETAIL_KEY);
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
