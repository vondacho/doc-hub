/**
 * What a card has to say beyond its title, and which cards have anything.
 *
 * "Detail" is the collapsible part of a card, and it has two halves that must
 * not be confused:
 *
 *   **derived** — an activity's cast, a story's need. Composed from fields that
 *   are modelled elsewhere, and therefore *not* editable as text: editing a
 *   rendering is how a board comes to disagree with the file behind it. The
 *   persona is changed from the card's menu; `want` and `so` are changed in the
 *   DSL.
 *
 *   **notes** — free prose, and the one part somebody can type into.
 *
 * One toggle covers both, because the reader's question is one question — *is
 * there more here?* — and it should not care which half answers it.
 *
 * This lives in lib rather than in the grid because two callers need the same
 * answer and must not disagree: the card renders the detail, and the toolbar's
 * show-all control has to know which cards have any.
 *
 * None of it is board state. Expanding a note is not an edit — it is not
 * undoable, it is not exported, and two people looking at the same file may
 * reasonably have different things open. The expanded set lives in the island.
 */

import type { Activity, BoardState, Id, Step, Story } from './state.ts';

/**
 * An activity's cast, as the multi-line note its backbone card carries.
 *
 * A heading and then one persona per line. Cards render notes with
 * `whitespace-pre-line`, so a list stays a list — and the top row of the board
 * becomes the answer to "whose map is this?", which a row of bare titles never
 * is.
 */
export function activityDerived(activity: Activity): readonly string[] {
	return activity.personas.length === 0 ? [] : [activity.personas.join('\n')];
}

export function stepDerived(_step: Step): readonly string[] {
	return [];
}

/**
 * A story's need is drawn by StoryNeed, not returned as text.
 *
 * It is three separately editable clauses, so it cannot be a block of prose
 * here. That is the difference between it and an activity's cast, which really
 * is just lines to read.
 */
export function storyHasNeed(story: Story): boolean {
	return story.persona !== null || story.want !== null || story.soThat !== null;
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
		if (activity && (activityDerived(activity).length > 0 || activity.notes.length > 0)) found.push(id);
	}
	for (const [id, step] of Object.entries(board.steps)) {
		if (stepDerived(step).length > 0 || step.notes.length > 0) found.push(id);
	}
	/*
	 * Every story counts, written need or not.
	 *
	 * A story exists to answer "who wants this, and why", so the way in has to be
	 * on the card rather than behind a menu item somebody has to know about. A
	 * caret on a story with nothing written is not a promise of nothing — it is
	 * where the three empty clauses are waiting.
	 */
	for (const id of Object.keys(board.stories)) found.push(id);
	return found;
}
