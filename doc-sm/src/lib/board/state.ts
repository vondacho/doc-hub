/**
 * The board model — a story map as the UI needs it.
 *
 * The second of doc-sm's two models (the first is src/lib/storymap/model.ts,
 * which mirrors the file). This one is normalised, carries generated ids, and
 * knows about cells and bands. Everything here exists because a drag-and-drop
 * surface needs it and the file format does not.
 *
 * ## The load-bearing decision: a story has no release
 *
 * `Story` has no `releaseId` field. The cell a story sits in *is* its release
 * assignment, and `cells` is the only place that fact is written down.
 *
 * The alternative — a `releaseId` on the story *and* a per-cell order array — is
 * two representations of one fact, and two representations are an invariant that
 * some reducer branch nobody re-read eventually violates. Deriving the `@Release`
 * tag from the cell key at export time means a corrupt export is not reachable,
 * rather than merely unlikely.
 *
 * It is also exactly the shape dnd-kit's multi-container sorting wants: one
 * SortableContext per cell over `cells[key]`, and a move is a splice out of one
 * array and a splice into another. Keying order per *step* instead, and
 * filtering by release at render time, means every move has to translate a
 * within-cell index back into a within-step index — which is where the
 * off-by-ones live.
 */

import { tagKey } from '../storymap/model.ts';
import type { CardKind, DeliveryKind, StoryStatus } from '../storymap/model.ts';

export type { CardKind, DeliveryKind, StoryStatus };

/**
 * In-memory only. Ids are never written to a `.storymap` file and are
 * regenerated on every import — nothing outside this browser tab refers to them.
 */
export type Id = string;

/**
 * The below-the-line band: stories that are known and not committed to.
 *
 * A sentinel rather than a real delivery, because it is not one — it cannot be
 * renamed, reordered or deleted, and it is always last. Using `null` for it
 * would work until it had to be part of a `CellKey`, which is a string.
 */
export const UNASSIGNED = '~';
export type BandId = Id | typeof UNASSIGNED;

/** `${stepId}|${bandId}`. Ids never contain `|` — they are `a1`, `p3`, `y7`. */
export type CellKey = string;

export function cellKey(stepId: Id, band: BandId): CellKey {
	return `${stepId}|${band}`;
}

export function splitCellKey(key: CellKey): { stepId: Id; band: BandId } {
	const separator = key.indexOf('|');
	return { stepId: key.slice(0, separator), band: key.slice(separator + 1) };
}

export interface Delivery {
	readonly id: Id;
	readonly title: string;
	/** Sprint or release. One type with a kind — see DeliveryNode in the model. */
	readonly kind: DeliveryKind;
	/** The band's id in the tracker, or null for one not linked to anything. */
	readonly ticket: string | null;
	readonly notes: readonly string[];
}

export interface Activity {
	readonly id: Id;
	readonly title: string;
	readonly notes: readonly string[];
	/** An activity is a capability: same ticket and status a step and story carry. */
	readonly ticket: string | null;
	readonly status: StoryStatus;
	/**
	 * The card's free labels, in the order the file writes them.
	 *
	 * Every kind carries them — an activity, a step and a story alike — because
	 * a tag says something that is *also* true of a card, and there is no level
	 * of the backbone where that stops being useful. See `tagKey` in the
	 * document model for what a tag is and why the vocabulary is open.
	 */
	readonly tags: readonly string[];
	/** This activity's cast. Its stories may name one of these, and no other. */
	readonly personas: readonly string[];
	readonly stepOrder: readonly Id[];
}

export interface Step {
	readonly id: Id;
	readonly title: string;
	readonly notes: readonly string[];
	/** A step is an epic: same ticket and status a story carries. */
	readonly ticket: string | null;
	readonly status: StoryStatus;
	readonly tags: readonly string[];
}

export interface Story {
	readonly id: Id;
	readonly title: string;
	readonly notes: readonly string[];
	/**
	 * The linked ticket, as the ticketing system spells it, or null when the
	 * story is not linked to one.
	 *
	 * doc-sm never invents this. It arrives either from a `.storymap` file, from
	 * an edit in the preview, or from the ticketing system when a ticket is
	 * created for the story — never from a counter in this application.
	 */
	readonly ticket: string | null;
	/** A cached copy of the ticket's status; `open` while unlinked. */
	readonly status: StoryStatus;
	/** The declared persona this story is written for, or null. */
	readonly persona: string | null;
	readonly want: string | null;
	readonly soThat: string | null;
	readonly tags: readonly string[];
}

export interface BoardState {
	readonly title: string;
	/**
	 * The registered product's shortname (doc-registry's `slug`), or null.
	 *
	 * Only the shortname is held. The display name is looked up from the product
	 * list for rendering and is never stored on the board, because the name is
	 * editable in the CMS while the slug is the identity — keeping a copy of the
	 * name would mean the board could disagree with the registry about what a
	 * product is called, and it is the file that would be wrong.
	 */
	readonly product: string | null;
	/**
	 * The ticketing space tickets are raised into, or null to follow the product.
	 * See `effectiveSpace` in ../storymap/model.ts — one answer, one place.
	 */
	readonly space: string | null;
	readonly notes: readonly string[];
	/** Band order, top to bottom. UNASSIGNED is implicit and always last. */
	readonly deliveryOrder: readonly Id[];
	readonly deliveries: Readonly<Record<Id, Delivery>>;
	readonly activityOrder: readonly Id[];
	readonly activities: Readonly<Record<Id, Activity>>;
	readonly steps: Readonly<Record<Id, Step>>;
	readonly stories: Readonly<Record<Id, Story>>;
	readonly cells: Readonly<Record<CellKey, readonly Id[]>>;
}

export function emptyBoard(title = 'Untitled story map'): BoardState {
	return {
		title,
		product: null,
		space: null,
		notes: [],
		deliveryOrder: [],
		deliveries: {},
		activityOrder: [],
		activities: {},
		steps: {},
		stories: {},
		cells: {},
	};
}

/* -------------------------------------------------------------------------- */
/* Selectors                                                                   */
/* -------------------------------------------------------------------------- */

/** Every band, in render order: the deliveries as declared, then below the line. */
export function bandOrder(board: BoardState): readonly BandId[] {
	return [...board.deliveryOrder, UNASSIGNED];
}

/** Steps left to right across the whole board, flattened out of the activities. */
export function stepOrder(board: BoardState): readonly Id[] {
	return board.activityOrder.flatMap((id) => board.activities[id]?.stepOrder ?? []);
}

export function storiesIn(board: BoardState, stepId: Id, band: BandId): readonly Id[] {
	return board.cells[cellKey(stepId, band)] ?? [];
}

/** One tag as the filter row offers it: how it is spelled, and how many wear it. */
export interface TagInUse {
	/** The first spelling seen, reading the backbone in board order. */
	readonly tag: string;
	/** What `tagKey` folds it to. The identity the filter actually matches on. */
	readonly key: string;
	readonly count: number;
}

/**
 * Every tag on the board, most-used first, with how many cards wear each.
 *
 * ## Folded by key, labelled by first spelling
 *
 * The parser refuses one card tagged `+Legal +legal`, but nothing stops *two*
 * cards spelling the same label differently — the check is per card, because
 * that is the scope in which a repeat means a bad merge. Here the two are one
 * tag with a count of two, since a filter that offered both would defeat the
 * only thing a tag is for.
 *
 * The label shown is the first spelling encountered, reading the board the way
 * a person does. Not the commonest, which would be more democratic and would
 * also make the chip rename itself as cards are added — a control whose text
 * moves under the reader is worse than one that picked a spelling and kept it.
 *
 * ## Counted across all three rows
 *
 * An activity, a step and a story wearing `+search` are three cards wearing it.
 * The count is what a chip is worth pressing for, and a number that only
 * counted stories would be wrong about a board whose backbone carries the
 * labels.
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

	// Board order, so "first spelling seen" means something a reader can predict.
	for (const activityId of board.activityOrder) {
		const activity = board.activities[activityId];
		if (activity === undefined) continue;
		add(activity.tags);
		for (const stepId of activity.stepOrder) {
			add(board.steps[stepId]?.tags ?? []);
			for (const band of bandOrder(board)) {
				for (const storyId of storiesIn(board, stepId, band)) add(board.stories[storyId]?.tags ?? []);
			}
		}
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
 * everything, and only the first should leave the board undimmed.
 *
 * **A card matches if it wears *any* of the chosen tags.** Union, not
 * intersection. The question somebody asks a map is "where is the payments
 * work, and the legal work" — narrowing to cards that are both is a rarer thing
 * to want, and it is the one of the two that can silently answer "nowhere" and
 * look like a broken filter.
 *
 * ## A parent matches when anything under it does
 *
 * This is where the story map differs from the wall in doc-es, and it is the
 * containment that causes it. There every card is a peer, so a card either
 * wears the tag or it does not. Here an activity is the *heading of a column*
 * and a step is the heading under it — so filtering for `+search` and dimming
 * an activity whose story is lit would grey out the label of the very thing
 * being pointed at. The column would read as switched off while its contents
 * read as switched on.
 *
 * So a hit lights its ancestors. That is the same argument that made this a dim
 * and not a hide: a filter here is for finding where something is, and an
 * answer with its own heading greyed out has lost the half that says where.
 *
 * It does not run the other way. A tagged activity does not light its stories:
 * they are the specific things being looked for, and lighting all of them would
 * answer a question nobody asked.
 */
export function filtered(board: BoardState, keys: ReadonlySet<string>): ReadonlySet<Id> | null {
	if (keys.size === 0) return null;

	const wears = (tags: readonly string[]) => tags.some((tag) => keys.has(tagKey(tag)));
	const matching = new Set<Id>();

	for (const activityId of board.activityOrder) {
		const activity = board.activities[activityId];
		if (activity === undefined) continue;
		let inActivity = wears(activity.tags);

		for (const stepId of activity.stepOrder) {
			let inStep = wears(board.steps[stepId]?.tags ?? []);

			for (const band of bandOrder(board)) {
				for (const storyId of storiesIn(board, stepId, band)) {
					if (!wears(board.stories[storyId]?.tags ?? [])) continue;
					matching.add(storyId);
					inStep = true;
				}
			}

			if (inStep) {
				matching.add(stepId);
				inActivity = true;
			}
		}

		if (inActivity) matching.add(activityId);
	}

	return matching;
}

/**
 * The stories with no ticket, in board order — what publishing would raise.
 *
 * Board order, not store order: the list a person confirms has to read in the
 * order they see on screen, or checking it against the board is guesswork.
 */
export function unboundStories(board: BoardState): readonly Story[] {
	const found: Story[] = [];
	for (const activityId of board.activityOrder) {
		for (const stepId of board.activities[activityId]?.stepOrder ?? []) {
			for (const band of bandOrder(board)) {
				for (const storyId of storiesIn(board, stepId, band)) {
					const story = board.stories[storyId];
					if (story && !isLinked(story)) found.push(story);
				}
			}
		}
	}
	return found;
}

/** True once a story has a ticket, which is the only thing "linked" means. */
export function isLinked(story: Story): boolean {
	return story.ticket !== null && story.ticket !== '';
}

/** The activity a step belongs to, or undefined if the board is inconsistent. */
export function activityOfStep(board: BoardState, stepId: Id): Activity | undefined {
	for (const id of board.activityOrder) {
		const activity = board.activities[id];
		if (activity?.stepOrder.includes(stepId)) return activity;
	}
	return undefined;
}

export interface ColumnGeometry {
	/** Total step columns on the board — at least one per activity. */
	readonly columnCount: number;
	/** 0-based column index of each step. */
	readonly columnOfStep: ReadonlyMap<Id, number>;
	/** 0-based start column and width of each activity's spanning header. */
	readonly spans: ReadonlyMap<Id, { start: number; width: number }>;
}

/**
 * Where every column sits. Computed once per render and read by everything else.
 *
 * An activity with no steps still occupies one column. Without that floor the
 * spanning header has a width of zero, the grid arithmetic after it is off by
 * one for every later activity, and there is nowhere to put the "add a step"
 * affordance — so an activity created on an empty board would be unreachable.
 */
export function columnGeometry(board: BoardState): ColumnGeometry {
	const columnOfStep = new Map<Id, number>();
	const spans = new Map<Id, { start: number; width: number }>();
	let column = 0;

	for (const activityId of board.activityOrder) {
		const activity = board.activities[activityId];
		if (!activity) continue;
		const start = column;
		for (const stepId of activity.stepOrder) {
			columnOfStep.set(stepId, column);
			column += 1;
		}
		const width = Math.max(1, activity.stepOrder.length);
		if (activity.stepOrder.length === 0) column += 1;
		spans.set(activityId, { start, width });
	}

	return { columnCount: Math.max(column, 1), columnOfStep, spans };
}
