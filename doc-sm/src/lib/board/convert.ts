/**
 * The seam between the file and the board.
 *
 * `toBoard` normalises a parsed document into the board's id-and-cell shape;
 * `toDocument` folds it back. These two functions are the entire cost of keeping
 * two models, and they are the reason src/lib/storymap/ has no idea what a cell
 * is — which is what makes the parser copyable into doc-em and doc-es.
 *
 * Ids come from a module-scoped counter rather than crypto.randomUUID(), so
 * `toBoard` is a deterministic function of its input. That keeps it debuggable,
 * keeps a board comparable to another built from the same file, and costs
 * nothing: the ids never leave the tab.
 */

import type {
	ActivityNode,
	StepNode,
	StoryMapDocument,
	StoryNode,
} from '../storymap/model.ts';
import {
	cellKey,
	emptyBoard,
	UNASSIGNED,
	type Activity,
	type BoardState,
	type CellKey,
	type Id,
	type Delivery,
	type Step,
	type Story,
} from './state.ts';

/** `a1`, `p3`, `y7`, `r2` — the prefix makes a stray id readable in a log. */
/**
 * ## Ids are positions, and that is the whole design
 *
 * The text is the source of truth, and text has no id column. A card's identity
 * is therefore *where it is written*: `a2` is the third activity, `a2p0` its
 * first step, `a2p0y1` the second story inside that step, `d0` the first band.
 *
 * **A reparse yields the same id for a card nobody moved**, which is what lets
 * the board keep React keys, an open card menu and a drag in flight across the
 * keystroke-by-keystroke reparsing the editor pane causes. A counter would mint
 * fresh ids on every parse and the board would remount itself as you typed.
 *
 * **An id decodes back to a position**, which is how a gesture finds the node
 * whose span it is about to splice — see `edit.ts`. No lookup table, and no
 * second source of identity to drift.
 *
 * The cost, accepted deliberately: ids shift when text above them changes. Move
 * the second activity and everything below it is renumbered. Nothing may hold an
 * id across an edit and expect it to still mean the same card.
 */

/** `d0` — the first band of the timeline. */
export function deliveryId(index: number): Id {
	return `d${index}`;
}

/** `a2` — the third activity, counting from the top of the file. */
export function activityId(index: number): Id {
	return `a${index}`;
}

/** `a2p0` — the first step written inside the third activity. */
export function stepId(activity: number, step: number): Id {
	return `a${activity}p${step}`;
}

/** `a2p0y1` — the second story written inside that step. */
export function storyId(activity: number, step: number, story: number): Id {
	return `a${activity}p${step}y${story}`;
}

/** Where a story is written, or null if the id names no story. */
export function storyPositionOf(id: Id): { activity: number; step: number; story: number } | null {
	const found = /^a(\d+)p(\d+)y(\d+)$/.exec(id);
	return found === null
		? null
		: { activity: Number(found[1]), step: Number(found[2]), story: Number(found[3]) };
}

/** Where a step is written, or null. */
export function stepPositionOf(id: Id): { activity: number; step: number } | null {
	const found = /^a(\d+)p(\d+)$/.exec(id);
	return found === null ? null : { activity: Number(found[1]), step: Number(found[2]) };
}

/** Which activity an id names, or null. */
export function activityPositionOf(id: Id): number | null {
	const found = /^a(\d+)$/.exec(id);
	return found === null ? null : Number(found[1]);
}

/** Which delivery an id names, or null. */
export function deliveryPositionOf(id: Id): number | null {
	const found = /^d(\d+)$/.exec(id);
	return found === null ? null : Number(found[1]);
}

export function toBoard(document: StoryMapDocument): BoardState {
	const deliveries: Record<Id, Delivery> = {};
	const deliveryOrder: Id[] = [];
	/** Delivery title → id. Sound because duplicate titles are a parse error. */
	const idOfDelivery = new Map<string, Id>();

	document.deliveries.forEach((delivery, deliveryIndex) => {
		const id = deliveryId(deliveryIndex);
		deliveries[id] = {
			id,
			title: delivery.title,
			kind: delivery.kind,
			ticket: delivery.ticket,
			notes: [...delivery.notes],
		};
		deliveryOrder.push(id);
		idOfDelivery.set(delivery.title, id);
	});

	const activities: Record<Id, Activity> = {};
	const activityOrder: Id[] = [];
	const steps: Record<Id, Step> = {};
	const stories: Record<Id, Story> = {};
	const cells: Record<CellKey, Id[]> = {};

	(document.activities as readonly ActivityNode[]).forEach((activity, activityIndex) => {
		const aid = activityId(activityIndex);
		const stepOrder: Id[] = [];

		(activity.steps as readonly StepNode[]).forEach((step, stepIndex) => {
			const pid = stepId(activityIndex, stepIndex);
			steps[pid] = {
				id: pid,
				title: step.title,
				notes: [...step.notes],
				ticket: step.ticket,
				status: step.status,
			};
			stepOrder.push(pid);

			(step.stories as readonly StoryNode[]).forEach((story, storyIndex) => {
				const yid = storyId(activityIndex, stepIndex, storyIndex);
				stories[yid] = {
					id: yid,
					title: story.title,
					notes: [...story.notes],
					ticket: story.ticket,
					status: story.status,
					persona: story.persona,
					want: story.want,
					soThat: story.soThat,
				};

				// An unresolvable title cannot happen — the parser rejects a
				// reference to an undeclared release — so an unknown one here
				// would be a bug in the parser, not bad input. Falling back to
				// below-the-line keeps the board consistent either way.
				const band = story.release === null ? UNASSIGNED : idOfDelivery.get(story.release) ?? UNASSIGNED;
				const key = cellKey(pid, band);
				(cells[key] ??= []).push(yid);
			});
		});

		activities[aid] = {
			id: aid,
			title: activity.title,
			notes: [...activity.notes],
			ticket: activity.ticket,
			status: activity.status,
			personas: [...activity.personas],
			stepOrder,
		};
		activityOrder.push(aid);
	});

	return {
		...emptyBoard(document.title),
		product: document.product,
		space: document.space,
		notes: [...document.notes],
		deliveryOrder,
		deliveries,
		activityOrder,
		activities,
		steps,
		stories,
		cells,
	};
}
