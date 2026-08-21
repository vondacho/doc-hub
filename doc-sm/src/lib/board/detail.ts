/**
 * What a card has to say beyond its title, and which cards have anything.
 *
 * "Detail" is the collapsible part of a card: an activity's cast, a story's
 * need, and any free notes on either. It is deliberately one idea rather than
 * three, because the reader's question is one question — *is there more here?* —
 * and the toggle that answers it should not care which kind of card it is on.
 *
 * This lives in lib rather than in the grid because two callers need the same
 * answer and must not disagree: the card renders the detail, and the toolbar's
 * show-all control has to know which cards have any.
 *
 * None of it is board state. Expanding a note is not an edit — it is not
 * undoable, it is not exported, and two people looking at the same file may
 * reasonably have different things open. The expanded set lives in the island.
 */

import { composeNeed, wrapNote } from '../storymap/model.ts';
import type { Activity, BoardState, Id, Step, Story } from './state.ts';

/**
 * An activity's cast, as the multi-line note its backbone card carries.
 *
 * A heading and then one persona per line. Cards render notes with
 * `whitespace-pre-line`, so a list stays a list — and the top row of the board
 * becomes the answer to "whose map is this?", which a row of bare titles never
 * is.
 */
export function activityDetail(activity: Activity): readonly string[] {
	if (activity.personas.length === 0) return activity.notes;
	return [`For:\n${activity.personas.join('\n')}`, ...activity.notes];
}

export function stepDetail(step: Step): readonly string[] {
	return step.notes;
}

/**
 * A story's need, composed from its three fields and wrapped to the measure,
 * with any free notes after it.
 *
 * Composed rather than stored, so the fields stay the single record of it. The
 * need comes first because it is why the card exists; a note is a footnote to
 * it.
 */
export function storyDetail(story: Story): readonly string[] {
	const need = composeNeed(story);
	return need === null ? story.notes : [wrapNote(need), ...story.notes];
}

/**
 * Every card that has something to expand, in no particular order.
 *
 * Used by the show-all control, which is a no-op on a board where nothing has
 * been written yet — and is disabled rather than silently doing nothing.
 */
export function cardsWithDetail(board: BoardState): readonly Id[] {
	const found: Id[] = [];
	for (const id of board.activityOrder) {
		const activity = board.activities[id];
		if (activity && activityDetail(activity).length > 0) found.push(id);
	}
	for (const [id, step] of Object.entries(board.steps)) {
		if (stepDetail(step).length > 0) found.push(id);
	}
	for (const [id, story] of Object.entries(board.stories)) {
		if (storyDetail(story).length > 0) found.push(id);
	}
	return found;
}
