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

import { parse } from '../storymap/parser.ts';
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
	type Release,
	type Step,
	type Story,
} from './state.ts';

let counter = 0;

/** `a1`, `p3`, `y7`, `r2` — the prefix makes a stray id readable in a log. */
export function nextId(prefix: 'a' | 'p' | 'y' | 'r'): Id {
	counter += 1;
	return `${prefix}${counter}`;
}

/** Only for tests and for a deterministic empty board. Never call it mid-session. */
export function resetIds(): void {
	counter = 0;
}

export function toBoard(document: StoryMapDocument): BoardState {
	const releases: Record<Id, Release> = {};
	const releaseOrder: Id[] = [];
	/** Release title → id. Sound because duplicate titles are a parse error. */
	const idOfRelease = new Map<string, Id>();

	for (const release of document.releases) {
		const id = nextId('r');
		releases[id] = { id, title: release.title, notes: [...release.notes] };
		releaseOrder.push(id);
		idOfRelease.set(release.title, id);
	}

	const activities: Record<Id, Activity> = {};
	const activityOrder: Id[] = [];
	const steps: Record<Id, Step> = {};
	const stories: Record<Id, Story> = {};
	const cells: Record<CellKey, Id[]> = {};

	for (const activity of document.activities as readonly ActivityNode[]) {
		const activityId = nextId('a');
		const stepOrder: Id[] = [];

		for (const step of activity.steps as readonly StepNode[]) {
			const stepId = nextId('p');
			steps[stepId] = {
				id: stepId,
				title: step.title,
				notes: [...step.notes],
				ticket: step.ticket,
				status: step.status,
			};
			stepOrder.push(stepId);

			for (const story of step.stories as readonly StoryNode[]) {
				const storyId = nextId('y');
				stories[storyId] = {
					id: storyId,
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
				const band = story.release === null ? UNASSIGNED : idOfRelease.get(story.release) ?? UNASSIGNED;
				const key = cellKey(stepId, band);
				(cells[key] ??= []).push(storyId);
			}
		}

		activities[activityId] = {
			id: activityId,
			title: activity.title,
			notes: [...activity.notes],
			ticket: activity.ticket,
			status: activity.status,
			personas: [...activity.personas],
			stepOrder,
		};
		activityOrder.push(activityId);
	}

	return {
		...emptyBoard(document.title),
		product: document.product,
		space: document.space,
		notes: [...document.notes],
		releaseOrder,
		releases,
		activityOrder,
		activities,
		steps,
		stories,
		cells,
	};
}

/**
 * Rebuild a board from text the visitor edited, keeping the current product.
 *
 * The whole board is replaced except for one field, and the exception is the
 * point. The product is owned by the picker, which chose it from the registry;
 * text typed into a box is validated against nothing, so letting it win would
 * put an unregistered or misspelled shortname into a file with nothing to catch
 * it. The `product` line still round-trips through the text like everything
 * else — it is read, and then ignored.
 *
 * A `.storymap` file *on disk* is a different case and is treated differently:
 * there the product comes from the file, because naming its product is how the
 * shortname travels between people at all. See the import path in
 * StoryMapBoard.tsx.
 *
 * @throws {StoryMapParseError} when the text does not parse; the caller shows
 *         the problems and leaves the board alone.
 */
export function applyText(source: string, current: BoardState): BoardState {
	const parsed = parse(source);
	// Ids are per-document and never leave the tab, so restarting the counter
	// keeps them short and keeps this a deterministic function of its inputs.
	resetIds();
	return { ...toBoard(parsed), product: current.product };
}

export function toDocument(board: BoardState): StoryMapDocument {
	return {
		title: board.title,
		product: board.product,
		space: board.space,
		notes: [...board.notes],
		releases: board.releaseOrder.flatMap((id) => {
			const release = board.releases[id];
			return release ? [{ title: release.title, notes: [...release.notes] }] : [];
		}),
		activities: board.activityOrder.flatMap((activityId) => {
			const activity = board.activities[activityId];
			if (!activity) return [];
			return [{
				title: activity.title,
				notes: [...activity.notes],
				ticket: activity.ticket,
				status: activity.status,
				personas: [...activity.personas],
				steps: activity.stepOrder.flatMap((stepId) => {
					const step = board.steps[stepId];
					if (!step) return [];
					return [{
						title: step.title,
						notes: [...step.notes],
						ticket: step.ticket,
						status: step.status,
						// Walk the bands in order so priority within a step reads
						// top band first — the same order the board shows.
						stories: [...board.releaseOrder, UNASSIGNED].flatMap((band) =>
							(board.cells[cellKey(stepId, band)] ?? []).flatMap((storyId) => {
								const story = board.stories[storyId];
								if (!story) return [];
								const release = band === UNASSIGNED ? null : board.releases[band]?.title ?? null;
								return [
									{
										title: story.title,
										notes: [...story.notes],
										release,
										ticket: story.ticket,
										status: story.status,
										persona: story.persona,
										want: story.want,
										soThat: story.soThat,
									},
								];
							}),
						),
					}];
				}),
			}];
		}),
	};
}
