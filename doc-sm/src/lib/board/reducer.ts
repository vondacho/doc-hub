/**
 * Every change the board can make, as one pure function.
 *
 * Imports nothing from React. This file is the tool; the island is a way to
 * drive it. That separation is what let steps 1 and 2 of the build be exercised
 * from a shell script before a single component existed.
 *
 * Two conventions hold throughout:
 *
 *   - A reducer that declines to act returns the *same object*. history.ts uses
 *     an identity check to decide whether an action consumed an undo step, so
 *     returning a fresh but equal object would fill the stack with no-ops.
 *   - Every move action carries its source (`from`, `fromActivityId`). That
 *     makes the reducer total without searching the store for where a card came
 *     from, and it makes each action mechanically invertible if per-action undo
 *     ever replaces snapshot undo.
 */

import {
	cellKey,
	splitCellKey,
	UNASSIGNED,
	type Activity,
	type BandId,
	type BoardState,
	type CardKind,
	type CellKey,
	type Id,
} from './state.ts';
import { nextId } from './convert.ts';

export type BoardAction =
	| { type: 'import'; board: BoardState }
	/**
	 * Replace the whole board from text the visitor edited in the preview.
	 *
	 * Distinct from `import` in exactly one way, and it is the way that matters:
	 * this does **not** clear the undo history. Importing a file opens a
	 * different document, so undoing back into the one it replaced would be a
	 * surprise rather than a rescue. Editing the text of the map you already have
	 * is an edit of that map — arguably the largest single edit the tool offers —
	 * and being unable to undo it would make the preview dangerous to experiment
	 * in, which is most of what it is for.
	 */
	| { type: 'applyText'; board: BoardState }
	| { type: 'reset' }
	| { type: 'setMapTitle'; title: string }
	| { type: 'setProduct'; product: string | null }
	| { type: 'retitle'; kind: CardKind | 'release'; id: Id; title: string }
	| { type: 'addActivity'; index: number }
	| { type: 'addStep'; activityId: Id; index: number }
	| { type: 'addStory'; cell: CellKey; index: number }
	| { type: 'addRelease'; index: number }
	| { type: 'removeRelease'; id: Id }
	| { type: 'removeCard'; kind: CardKind; id: Id }
	| { type: 'moveStory'; storyId: Id; from: CellKey; to: CellKey; index: number }
	| { type: 'moveStep'; stepId: Id; fromActivityId: Id; toActivityId: Id; index: number }
	| { type: 'moveActivity'; activityId: Id; index: number }
	| { type: 'moveRelease'; releaseId: Id; index: number }
	| { type: 'changeKind'; kind: CardKind; id: Id; to: CardKind };

/** Actions that replace the document rather than edit it; history.ts clears on these. */
export function resetsHistory(action: BoardAction): boolean {
	return action.type === 'import' || action.type === 'reset';
}

export function reduce(board: BoardState, action: BoardAction): BoardState {
	switch (action.type) {
		case 'import':
		case 'applyText':
			return action.board;

		case 'reset':
			return { ...board, product: null, notes: [], releaseOrder: [], releases: {}, activityOrder: [], activities: {}, steps: {}, stories: {}, cells: {} };

		case 'setMapTitle':
			return action.title === board.title ? board : { ...board, title: action.title };

		case 'setProduct':
			return action.product === board.product ? board : { ...board, product: action.product };

		case 'retitle':
			return retitle(board, action.kind, action.id, action.title);

		case 'addActivity': {
			const id = nextId('a');
			return {
				...board,
				activities: { ...board.activities, [id]: { id, title: 'New activity', notes: [], stepOrder: [] } },
				activityOrder: insertAt(board.activityOrder, action.index, id),
			};
		}

		case 'addStep': {
			const activity = board.activities[action.activityId];
			if (!activity) return board;
			const id = nextId('p');
			return {
				...board,
				steps: { ...board.steps, [id]: { id, title: 'New step', notes: [] } },
				activities: {
					...board.activities,
					[activity.id]: { ...activity, stepOrder: insertAt(activity.stepOrder, action.index, id) },
				},
			};
		}

		case 'addStory': {
			const { stepId } = splitCellKey(action.cell);
			if (!board.steps[stepId]) return board;
			const id = nextId('y');
			return {
				...board,
				stories: { ...board.stories, [id]: { id, title: 'New story', notes: [] } },
				cells: { ...board.cells, [action.cell]: insertAt(board.cells[action.cell] ?? [], action.index, id) },
			};
		}

		case 'addRelease': {
			const id = nextId('r');
			return {
				...board,
				releases: { ...board.releases, [id]: { id, title: uniqueReleaseTitle(board), notes: [] } },
				releaseOrder: insertAt(board.releaseOrder, action.index, id),
			};
		}

		case 'removeRelease':
			return removeRelease(board, action.id);

		case 'removeCard':
			return removeCard(board, action.kind, action.id);

		case 'moveStory':
			return moveStory(board, action.storyId, action.from, action.to, action.index);

		case 'moveStep':
			return moveStep(board, action.stepId, action.fromActivityId, action.toActivityId, action.index);

		case 'moveActivity': {
			const order = moveWithin(board.activityOrder, action.activityId, action.index);
			return order === board.activityOrder ? board : { ...board, activityOrder: order };
		}

		case 'moveRelease': {
			const order = moveWithin(board.releaseOrder, action.releaseId, action.index);
			return order === board.releaseOrder ? board : { ...board, releaseOrder: order };
		}

		case 'changeKind':
			return changeKind(board, action.kind, action.id, action.to);
	}
}

/* -------------------------------------------------------------------------- */
/* Retitle                                                                     */
/* -------------------------------------------------------------------------- */

function retitle(board: BoardState, kind: CardKind | 'release', id: Id, raw: string): BoardState {
	const title = raw.trim();
	if (title === '') return board;

	if (kind === 'release') {
		const release = board.releases[id];
		if (!release || release.title === title) return board;
		// Release titles are the key `@Release` resolves against, so a duplicate
		// would not survive an export. Refused here rather than at export time,
		// where the damage is already done.
		if (board.releaseOrder.some((other) => other !== id && board.releases[other]?.title === title)) return board;
		return { ...board, releases: { ...board.releases, [id]: { ...release, title } } };
	}

	if (kind === 'activity') {
		const activity = board.activities[id];
		if (!activity || activity.title === title) return board;
		return { ...board, activities: { ...board.activities, [id]: { ...activity, title } } };
	}

	if (kind === 'step') {
		const step = board.steps[id];
		if (!step || step.title === title) return board;
		return { ...board, steps: { ...board.steps, [id]: { ...step, title } } };
	}

	const story = board.stories[id];
	if (!story || story.title === title) return board;
	return { ...board, stories: { ...board.stories, [id]: { ...story, title } } };
}

/* -------------------------------------------------------------------------- */
/* Remove                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Deleting a band moves its stories below the line; it never deletes them.
 *
 * Removing a release is a statement about the plan, not about the work. A
 * delete that silently took ten stories with it would be the most expensive
 * click in the tool.
 */
function removeRelease(board: BoardState, id: Id): BoardState {
	if (!board.releases[id]) return board;

	const releases = { ...board.releases };
	delete releases[id];

	const cells: Record<CellKey, readonly Id[]> = { ...board.cells };
	for (const key of Object.keys(board.cells)) {
		const { stepId, band } = splitCellKey(key);
		if (band !== id) continue;
		const orphans = board.cells[key] ?? [];
		delete cells[key];
		if (orphans.length === 0) continue;
		const target = cellKey(stepId, UNASSIGNED);
		cells[target] = [...(cells[target] ?? []), ...orphans];
	}

	return {
		...board,
		releases,
		releaseOrder: board.releaseOrder.filter((other) => other !== id),
		cells,
	};
}

function removeCard(board: BoardState, kind: CardKind, id: Id): BoardState {
	if (kind === 'story') {
		const story = board.stories[id];
		if (!story) return board;
		const stories = { ...board.stories };
		delete stories[id];
		const cells: Record<CellKey, readonly Id[]> = {};
		for (const [key, ids] of Object.entries(board.cells)) {
			const kept = ids.filter((other) => other !== id);
			if (kept.length > 0) cells[key] = kept;
		}
		return { ...board, stories, cells };
	}

	if (kind === 'step') {
		const activity = activityOwning(board, id);
		if (!activity) return board;
		return dropStep(board, activity, id);
	}

	const activity = board.activities[id];
	if (!activity) return board;
	let next: BoardState = board;
	for (const stepId of activity.stepOrder) next = dropStep(next, next.activities[id]!, stepId);
	const activities = { ...next.activities };
	delete activities[id];
	return { ...next, activities, activityOrder: next.activityOrder.filter((other) => other !== id) };
}

/** Remove one step, its cells, and every story that lived in them. */
function dropStep(board: BoardState, activity: Activity, stepId: Id): BoardState {
	const steps = { ...board.steps };
	delete steps[stepId];

	const stories = { ...board.stories };
	const cells: Record<CellKey, readonly Id[]> = {};
	for (const [key, ids] of Object.entries(board.cells)) {
		if (splitCellKey(key).stepId === stepId) {
			for (const storyId of ids) delete stories[storyId];
			continue;
		}
		cells[key] = ids;
	}

	return {
		...board,
		steps,
		stories,
		cells,
		activities: {
			...board.activities,
			[activity.id]: { ...activity, stepOrder: activity.stepOrder.filter((other) => other !== stepId) },
		},
	};
}

/* -------------------------------------------------------------------------- */
/* Move                                                                        */
/* -------------------------------------------------------------------------- */

function moveStory(board: BoardState, storyId: Id, from: CellKey, to: CellKey, index: number): BoardState {
	const source = board.cells[from] ?? [];
	if (!source.includes(storyId)) return board;
	if (!board.steps[splitCellKey(to).stepId]) return board;

	if (from === to) {
		const reordered = moveWithin(source, storyId, index);
		return reordered === source ? board : { ...board, cells: { ...board.cells, [from]: reordered } };
	}

	const remaining = source.filter((id) => id !== storyId);
	const target = insertAt(board.cells[to] ?? [], index, storyId);
	const cells = { ...board.cells, [to]: target };
	if (remaining.length > 0) cells[from] = remaining;
	else delete cells[from];
	return { ...board, cells };
}

function moveStep(board: BoardState, stepId: Id, fromId: Id, toId: Id, index: number): BoardState {
	const from = board.activities[fromId];
	const to = board.activities[toId];
	if (!from || !to || !from.stepOrder.includes(stepId)) return board;

	if (fromId === toId) {
		const reordered = moveWithin(from.stepOrder, stepId, index);
		if (reordered === from.stepOrder) return board;
		return { ...board, activities: { ...board.activities, [fromId]: { ...from, stepOrder: reordered } } };
	}

	// The step's stories travel with it: cells are keyed by step id, so nothing
	// about them changes when the step changes parent.
	return {
		...board,
		activities: {
			...board.activities,
			[fromId]: { ...from, stepOrder: from.stepOrder.filter((id) => id !== stepId) },
			[toId]: { ...to, stepOrder: insertAt(to.stepOrder, index, stepId) },
		},
	};
}

/* -------------------------------------------------------------------------- */
/* Change kind                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Whether a card can become another kind, and if not, why.
 *
 * Vagueness here is how a board tool loses somebody's work, so v1 offers the
 * change only where nothing is lost and refuses otherwise with the reason. The
 * reason is shown to the reader — a disabled menu item with no explanation is
 * indistinguishable from a bug.
 */
export function canChangeKind(
	board: BoardState,
	kind: CardKind,
	id: Id,
	to: CardKind,
): { ok: true } | { ok: false; reason: string } {
	if (kind === to) return { ok: false, reason: 'It is already that kind.' };

	if (kind === 'story') {
		if (to === 'step') return { ok: true };
		return { ok: false, reason: 'Promote it to a step first — an activity holds steps, not stories.' };
	}

	if (kind === 'step') {
		const activity = activityOwning(board, id);
		if (!activity) return { ok: false, reason: 'This step is not on the board.' };
		if (to === 'activity') return { ok: true };
		const holds = Object.keys(board.cells).some(
			(key) => splitCellKey(key).stepId === id && (board.cells[key] ?? []).length > 0,
		);
		if (holds) return { ok: false, reason: 'Move or delete its stories first — a story cannot hold stories.' };
		if (activity.stepOrder.length < 2) return { ok: false, reason: 'Its activity would be left with no steps.' };
		return { ok: true };
	}

	if (to === 'story') return { ok: false, reason: 'Demote it to a step first — a story lives under a step.' };
	const activity = board.activities[id];
	if (!activity) return { ok: false, reason: 'This activity is not on the board.' };
	if (activity.stepOrder.length > 0) return { ok: false, reason: 'Move or delete its steps first.' };
	if (board.activityOrder.indexOf(id) < 1) return { ok: false, reason: 'There is no activity to its left to hold it.' };
	return { ok: true };
}

function changeKind(board: BoardState, kind: CardKind, id: Id, to: CardKind): BoardState {
	if (!canChangeKind(board, kind, id, to).ok) return board;

	// story → step. A new empty step lands immediately after the story's own
	// step, in the same activity. The story's release is dropped, because a step
	// is not in a band — that is the one thing this move loses, and it is why it
	// is offered only in this direction.
	if (kind === 'story' && to === 'step') {
		const found = locateStory(board, id);
		if (!found) return board;
		const activity = activityOwning(board, found.stepId);
		if (!activity) return board;
		const story = board.stories[id];
		if (!story) return board;

		const stepId = nextId('p');
		const after = removeCard(board, 'story', id);
		return {
			...after,
			steps: { ...after.steps, [stepId]: { id: stepId, title: story.title, notes: [...story.notes] } },
			activities: {
				...after.activities,
				[activity.id]: {
					...after.activities[activity.id]!,
					stepOrder: insertAt(
						after.activities[activity.id]!.stepOrder,
						after.activities[activity.id]!.stepOrder.indexOf(found.stepId) + 1,
						stepId,
					),
				},
			},
		};
	}

	// step → activity. The step becomes an activity inserted after its own, and
	// its stories travel inside a step of the same title — so nothing is lost
	// and the column keeps its contents.
	if (kind === 'step' && to === 'activity') {
		const activity = activityOwning(board, id);
		const step = board.steps[id];
		if (!activity || !step) return board;

		const activityId = nextId('a');
		return {
			...board,
			activities: {
				...board.activities,
				[activity.id]: { ...activity, stepOrder: activity.stepOrder.filter((other) => other !== id) },
				[activityId]: { id: activityId, title: step.title, notes: [], stepOrder: [id] },
			},
			activityOrder: insertAt(board.activityOrder, board.activityOrder.indexOf(activity.id) + 1, activityId),
		};
	}

	// step → story. Only reachable for an empty step, so there are no cells to
	// move. It lands below the line under the step to its left, because it has
	// no release to claim.
	if (kind === 'step' && to === 'story') {
		const activity = activityOwning(board, id);
		const step = board.steps[id];
		if (!activity || !step) return board;

		const position = activity.stepOrder.indexOf(id);
		const neighbour = activity.stepOrder[position - 1] ?? activity.stepOrder[position + 1];
		if (neighbour === undefined) return board;

		const storyId = nextId('y');
		const after = dropStep(board, activity, id);
		const key = cellKey(neighbour, UNASSIGNED);
		return {
			...after,
			stories: { ...after.stories, [storyId]: { id: storyId, title: step.title, notes: [...step.notes] } },
			cells: { ...after.cells, [key]: [...(after.cells[key] ?? []), storyId] },
		};
	}

	// activity → step. Only reachable for an empty activity, appended to the one
	// before it.
	if (kind === 'activity' && to === 'step') {
		const activity = board.activities[id];
		if (!activity) return board;
		const position = board.activityOrder.indexOf(id);
		const previousId = board.activityOrder[position - 1];
		const previous = previousId ? board.activities[previousId] : undefined;
		if (!previous) return board;

		const stepId = nextId('p');
		const activities = { ...board.activities };
		delete activities[id];
		return {
			...board,
			steps: { ...board.steps, [stepId]: { id: stepId, title: activity.title, notes: [...activity.notes] } },
			activities: { ...activities, [previous.id]: { ...previous, stepOrder: [...previous.stepOrder, stepId] } },
			activityOrder: board.activityOrder.filter((other) => other !== id),
		};
	}

	return board;
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

export function locateStory(
	board: BoardState,
	storyId: Id,
): { stepId: Id; band: BandId; key: CellKey; index: number } | undefined {
	for (const [key, ids] of Object.entries(board.cells)) {
		const index = ids.indexOf(storyId);
		if (index === -1) continue;
		const { stepId, band } = splitCellKey(key);
		return { stepId, band, key, index };
	}
	return undefined;
}

function activityOwning(board: BoardState, stepId: Id): Activity | undefined {
	for (const id of board.activityOrder) {
		const activity = board.activities[id];
		if (activity?.stepOrder.includes(stepId)) return activity;
	}
	return undefined;
}

function uniqueReleaseTitle(board: BoardState): string {
	const taken = new Set(board.releaseOrder.map((id) => board.releases[id]?.title));
	for (let n = board.releaseOrder.length + 1; ; n += 1) {
		const candidate = `Release ${n}`;
		if (!taken.has(candidate)) return candidate;
	}
}

function insertAt<T>(list: readonly T[], index: number, item: T): readonly T[] {
	const at = Math.max(0, Math.min(index, list.length));
	return [...list.slice(0, at), item, ...list.slice(at)];
}

/** Move an item already in the list to a new index; same object if it does not move. */
function moveWithin<T>(list: readonly T[], item: T, index: number): readonly T[] {
	const from = list.indexOf(item);
	if (from === -1) return list;
	const to = Math.max(0, Math.min(index, list.length - 1));
	if (from === to) return list;
	const rest = [...list.slice(0, from), ...list.slice(from + 1)];
	return [...rest.slice(0, to), item, ...rest.slice(to)];
}
