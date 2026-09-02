/**
 * The vocabulary of gestures, and the queries the board still asks.
 *
 * This was `reducer.ts`, and it deliberately no longer holds a reducer. The
 * text is the source of truth now: a gesture is not folded into a `BoardState`,
 * it is translated into a splice by `apply.ts` and written into the file.
 *
 * What survives is the *shape* of each gesture — the union below — because that
 * is the language the grid speaks. Keeping it is why `BoardGrid`, `Card`,
 * `Cell`, `CardMenu`, `BandRail`, `StoryMeta` and `StoryNeed` did not change at
 * all: they still say what the visitor did, and something else decides what that
 * does to the text.
 *
 * `canChangeKind` stays because it is a *question*, not an edit — the card menu
 * asks it to know whether to offer a promotion, and to say why not when it
 * cannot. It reads the projection, which is exactly what the menu is looking at.
 */

import {
	splitCellKey,
	type Activity,
	type BandId,
	type BoardState,
	type CardKind,
	type CellKey,
	type Id,
	type StoryStatus,
} from './state.ts';
import type { DeliveryKind } from '../storymap/model.ts';

export type BoardAction =
	| { type: 'import'; text: string }
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
	| { type: 'applyText'; text: string }
	| { type: 'reset' }
	| { type: 'setMapTitle'; title: string }
	/**
	 * Choose the product, and initialise the ticketing space from it.
	 *
	 * The space is set to the shortname **only when it has none yet**. Choosing a
	 * product on a fresh board therefore fills both, which is the case that wants
	 * no thought; changing the product later leaves a space that was already
	 * settled alone, because tickets raised into it carry keys from it and quietly
	 * re-pointing the map at another space would strand them.
	 */
	| { type: 'setProduct'; product: string | null }
	| { type: 'setSpace'; space: string | null }
	| { type: 'retitle'; kind: CardKind | 'delivery'; id: Id; title: string }
	| { type: 'addActivity'; index: number }
	| { type: 'addStep'; activityId: Id; index: number }
	| { type: 'addStory'; cell: CellKey; index: number }
	| { type: 'addDelivery'; kind: DeliveryKind; index: number }
	| { type: 'setDeliveryKind'; id: Id; kind: DeliveryKind }
	/** The band's id in the tracker. Editable here: doc-sm issues these itself. */
	| { type: 'setDeliveryTicket'; id: Id; ticket: string | null }
	| { type: 'removeDelivery'; id: Id }
	| { type: 'removeCard'; kind: CardKind; id: Id }
	| { type: 'moveStory'; storyId: Id; from: CellKey; to: CellKey; index: number }
	| { type: 'moveStep'; stepId: Id; fromActivityId: Id; toActivityId: Id; index: number }
	| { type: 'moveActivity'; activityId: Id; index: number }
	| { type: 'moveDelivery'; deliveryId: Id; index: number }
	| { type: 'changeKind'; kind: CardKind; id: Id; to: CardKind }
	/**
	 * Link a story to a ticket, or unlink it with `null`.
	 *
	 * Only ever carries an id that came from outside doc-sm — a file, an edit in
	 * the preview, or the ticketing system itself. There is deliberately no action
	 * that *generates* one: the ticketing system issues ticket ids, and a board
	 * that minted its own would hand out names that collide with real ones.
	 */
	| { type: 'setTicket'; kind: CardKind; id: Id; ticket: string | null }
	/**
	 * Record a status against a story.
	 *
	 * Authoritative only while the story is unlinked. Once it has a ticket this is
	 * a cache of what the ticketing system last said, and setting it by hand
	 * changes the board's copy, not the ticket.
	 */
	| { type: 'setStatus'; kind: CardKind; id: Id; status: StoryStatus }
	/**
	 * Write a story for one of the map's declared personas, or for nobody.
	 *
	 * Only ever a title the map already declares — the menu offers exactly those —
	 * so the reference cannot drift from the cast. Clearing it with `null` is a
	 * real answer: a story nobody has decided the audience for is an ordinary
	 * state on a board mid-workshop.
	 */
	| { type: 'setPersona'; id: Id; persona: string | null }
	/**
	 * Replace a card's free notes with one edited block of text.
	 *
	 * The whole block, not one note: the card presents its notes as a single text
	 * area, so the edit that comes back is a single text. A blank line separates
	 * one note from the next — see splitNotes, which is the same rule the renderer
	 * joins by, so what somebody typed is what is read back.
	 *
	 * Only *free* notes. A story's need and an activity's cast are composed from
	 * modelled fields and are not text anyone edits here; editing a rendering is
	 * how a board comes to disagree with the file behind it.
	 */
	| { type: 'setNotes'; kind: CardKind; id: Id; text: string }
	/**
	 * Write a card's tags. The list replaces whatever it had.
	 *
	 * Whole rather than add-one/remove-one, because that is the shape the editor
	 * on the card produces: somebody types a line of labels and commits it. An
	 * empty list clears them, and is the ordinary way a tag is taken off.
	 */
	| { type: 'setTags'; kind: CardKind; id: Id; tags: readonly string[] }
	/**
	 * Write one clause of a story's need.
	 *
	 * One field at a time, because that is how they are read and corrected. The
	 * text is collapsed to a single line: `want` and `so` are one clause of one
	 * sentence, and a break inside one would be a break in the middle of it. The
	 * file wraps them to the measure; the model does not.
	 */
	| { type: 'setNeed'; id: Id; field: 'want' | 'soThat'; text: string };

/** Actions that replace the document rather than edit it; history.ts clears on these. */
export function resetsHistory(action: BoardAction): boolean {
	return action.type === 'import' || action.type === 'reset';
}

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

/* -------------------------------------------------------------------------- */
/* Small helpers                                                               */
/* -------------------------------------------------------------------------- */

/** The personas a story may be written for: those its own activity lists. */
export function personasFor(board: BoardState, storyId: Id): readonly string[] {
	const found = locateStory(board, storyId);
	if (!found) return [];
	for (const activityId of board.activityOrder) {
		const activity = board.activities[activityId];
		if (activity?.stepOrder.includes(found.stepId)) return activity.personas;
	}
	return [];
}

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
