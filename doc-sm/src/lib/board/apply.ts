/**
 * A gesture, turned into an edit of the source text.
 *
 * The seam that let the whole grid stay as it was. `BoardGrid`, `Card`, `Cell`,
 * `CardMenu`, `BandRail`, `StoryMeta` and `StoryNeed` still say what the visitor
 * did — `{ type: 'moveStory', … }` — and this decides what that does to the
 * file. Nothing above this line knows the board is a projection of text.
 *
 * ## Ids in, positions out
 *
 * The grid holds ids because dnd-kit needs them; the edit layer takes positions
 * because a splice is about where something is written. Translating between the
 * two is this module's other job, and it is why every case below either resolves
 * cleanly or hands the source back untouched. An id that no longer names
 * anything is a stale render, not an emergency: the next parse brings the board
 * back in step, and doing nothing is the only safe answer meanwhile.
 */

import * as edit from './edit.ts';
import {
	activityPositionOf,
	deliveryPositionOf,
	stepPositionOf,
	storyPositionOf,
} from './convert.ts';
import { splitCellKey, UNASSIGNED, type BoardState } from './state.ts';
import type { BoardAction } from './gestures.ts';
import type { StoryMapDocument } from '../storymap/model.ts';

/** The delivery an id names, as the title the file writes. Null is below the line. */
function bandTitle(document: StoryMapDocument, band: string): string | null {
	if (band === UNASSIGNED) return null;
	const index = deliveryPositionOf(band);
	return index === null ? null : (document.deliveries[index]?.title ?? null);
}

/** A cell key, as the step it names and the band it sits in. */
function cell(document: StoryMapDocument, key: string) {
	const { stepId, band } = splitCellKey(key);
	const step = stepPositionOf(stepId);
	return step === null ? null : { step, release: bandTitle(document, band) };
}

/**
 * The text this gesture produces, or the text unchanged when it cannot be placed.
 *
 * `import`, `applyText` and `reset` are not here: they replace the whole
 * document rather than editing one, so the board handles them directly.
 */
export function applyAction(
	source: string,
	d: StoryMapDocument,
	_board: BoardState,
	action: BoardAction,
): string {
	switch (action.type) {
		case 'setMapTitle':
			return edit.setMapTitle(source, d, action.title);

		case 'setProduct':
			return edit.setProduct(source, d, action.product);

		case 'setSpace':
			return edit.setSpace(source, d, action.space);

		case 'retitle': {
			if (action.kind === 'delivery') {
				const at = deliveryPositionOf(action.id);
				return at === null ? source : edit.retitleDelivery(source, d, at, action.title);
			}
			if (action.kind === 'activity') {
				const at = activityPositionOf(action.id);
				return at === null ? source : edit.retitleActivity(source, d, at, action.title);
			}
			if (action.kind === 'step') {
				const at = stepPositionOf(action.id);
				return at === null ? source : edit.retitleStep(source, d, at, action.title);
			}
			const at = storyPositionOf(action.id);
			return at === null ? source : edit.retitleStory(source, d, at, action.title);
		}

		case 'addActivity':
			return edit.addActivity(source, d, action.index);

		case 'addStep': {
			const at = activityPositionOf(action.activityId);
			return at === null ? source : edit.addStep(source, d, at, action.index);
		}

		case 'addStory': {
			const where = cell(d, action.cell);
			return where === null
				? source
				: edit.addStory(source, d, where.step, action.index, where.release);
		}

		case 'addDelivery':
			return edit.addDelivery(source, d, action.kind, action.index);

		case 'setDeliveryKind': {
			const at = deliveryPositionOf(action.id);
			return at === null ? source : edit.setDeliveryKind(source, d, at, action.kind);
		}

		case 'setDeliveryTicket': {
			const at = deliveryPositionOf(action.id);
			return at === null ? source : edit.setTicket(source, d, d.deliveries[at], action.ticket);
		}

		case 'removeDelivery': {
			const at = deliveryPositionOf(action.id);
			return at === null ? source : edit.removeDelivery(source, d, at);
		}

		case 'removeCard': {
			if (action.kind === 'activity') {
				const at = activityPositionOf(action.id);
				return at === null ? source : edit.removeActivity(source, d, at);
			}
			if (action.kind === 'step') {
				const at = stepPositionOf(action.id);
				return at === null ? source : edit.removeStep(source, d, at);
			}
			const at = storyPositionOf(action.id);
			return at === null ? source : edit.removeStory(source, d, at);
		}

		case 'moveStory': {
			const at = storyPositionOf(action.storyId);
			const to = cell(d, action.to);
			return at === null || to === null
				? source
				: edit.moveStory(source, d, at, to.step, action.index, to.release);
		}

		case 'moveStep': {
			const at = stepPositionOf(action.stepId);
			const to = activityPositionOf(action.toActivityId);
			return at === null || to === null ? source : edit.moveStep(source, d, at, to, action.index);
		}

		case 'moveActivity': {
			const at = activityPositionOf(action.activityId);
			return at === null ? source : edit.moveActivity(source, d, at, action.index);
		}

		case 'moveDelivery': {
			const at = deliveryPositionOf(action.deliveryId);
			return at === null ? source : edit.moveDelivery(source, d, at, action.index);
		}

		case 'changeKind': {
			if (action.kind === 'story' && action.to === 'step') {
				const at = storyPositionOf(action.id);
				return at === null ? source : edit.storyToStep(source, d, at);
			}
			if (action.kind === 'step' && action.to === 'activity') {
				const at = stepPositionOf(action.id);
				return at === null ? source : edit.stepToActivity(source, d, at);
			}
			if (action.kind === 'step' && action.to === 'story') {
				const at = stepPositionOf(action.id);
				return at === null ? source : edit.stepToStory(source, d, at);
			}
			// Every other pairing is refused by `canChangeKind` before it reaches
			// here; doing nothing is the honest answer if one ever does.
			return source;
		}

		case 'setTicket': {
			const at = locate(action.kind, action.id);
			return at === null
				? source
				: edit.setTicket(source, d, edit.cardAt(d, action.kind, at), action.ticket);
		}

		case 'setStatus': {
			const at = locate(action.kind, action.id);
			return at === null
				? source
				: edit.setStatus(source, d, edit.cardAt(d, action.kind, at), action.status);
		}

		case 'setPersona': {
			const at = storyPositionOf(action.id);
			return at === null ? source : edit.setPersona(source, d, at, action.persona);
		}

		case 'setNeed': {
			const at = storyPositionOf(action.id);
			return at === null ? source : edit.setNeed(source, d, at, action.field, action.text);
		}

		case 'setNotes': {
			const owner = nodeOf(d, action.kind, action.id);
			return edit.setNotes(source, d, owner, action.text);
		}

		case 'setTags': {
			const owner = nodeOf(d, action.kind, action.id);
			return edit.setTags(source, d, owner, action.tags);
		}

		// Handled by the board: these replace the document rather than edit it.
		case 'import':
		case 'applyText':
		case 'reset':
			return source;
	}
}

/**
 * A card of any kind, as a story position.
 *
 * The three kinds nest, so one shape addresses all of them: an activity uses
 * only `activity`, a step uses `activity` and `step`, a story uses all three.
 * The unused fields are zero and are never read.
 */
function locate(kind: 'activity' | 'step' | 'story', id: string) {
	if (kind === 'activity') {
		const at = activityPositionOf(id);
		return at === null ? null : { activity: at, step: 0, story: 0 };
	}
	if (kind === 'step') {
		const at = stepPositionOf(id);
		return at === null ? null : { ...at, story: 0 };
	}
	return storyPositionOf(id);
}

/**
 * The declaration an id names, whatever level of the backbone it sits at.
 *
 * The three rows are three types with the same shape, and the gestures every
 * card shares — notes, tags — want the node rather than the coordinates. Lifted
 * out of `setNotes`'s case when the second such gesture arrived, because a
 * three-armed conditional written twice is the one that gets fixed once.
 */
function nodeOf(d: StoryMapDocument, kind: 'activity' | 'step' | 'story', id: string) {
	const at = locate(kind, id);
	if (at === null) return undefined;
	if (kind === 'activity') return d.activities[at.activity];
	if (kind === 'step') return d.activities[at.activity]?.steps[at.step];
	return d.activities[at.activity]?.steps[at.step]?.stories[at.story];
}

/** Whether this gesture is one `applyAction` can carry out. */
export function isEdit(action: BoardAction): boolean {
	return action.type !== 'import' && action.type !== 'applyText' && action.type !== 'reset';
}
