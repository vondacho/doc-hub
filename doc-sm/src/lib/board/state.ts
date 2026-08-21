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

import type { CardKind, StoryStatus } from '../storymap/model.ts';

export type { CardKind, StoryStatus };

/**
 * In-memory only. Ids are never written to a `.storymap` file and are
 * regenerated on every import — nothing outside this browser tab refers to them.
 */
export type Id = string;

/**
 * The below-the-line band: stories that are known and not committed to.
 *
 * A sentinel rather than a real release, because it is not one — it cannot be
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

export interface Release {
	readonly id: Id;
	readonly title: string;
	readonly notes: readonly string[];
}

export interface Activity {
	readonly id: Id;
	readonly title: string;
	readonly notes: readonly string[];
	/** This activity's cast. Its stories may name one of these, and no other. */
	readonly personas: readonly string[];
	readonly stepOrder: readonly Id[];
}

export interface Step {
	readonly id: Id;
	readonly title: string;
	readonly notes: readonly string[];
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
	readonly releaseOrder: readonly Id[];
	readonly releases: Readonly<Record<Id, Release>>;
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
		releaseOrder: [],
		releases: {},
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

/** Every band, in render order: the releases as declared, then below the line. */
export function bandOrder(board: BoardState): readonly BandId[] {
	return [...board.releaseOrder, UNASSIGNED];
}

/** Steps left to right across the whole board, flattened out of the activities. */
export function stepOrder(board: BoardState): readonly Id[] {
	return board.activityOrder.flatMap((id) => board.activities[id]?.stepOrder ?? []);
}

export function storiesIn(board: BoardState, stepId: Id, band: BandId): readonly Id[] {
	return board.cells[cellKey(stepId, band)] ?? [];
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
