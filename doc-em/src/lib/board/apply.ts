/**
 * A gesture, turned into an edit of the source text.
 *
 * The seam that let the whole grid stay as it was. `BoardGrid`, `Card`,
 * `DeliveryRail`, `ExampleSteps`, `StoryMeta` and `StoryNeed` still say what the
 * visitor did — `{ type: 'moveExample', … }` — and this decides what that does
 * to the file. Nothing above this line knows the board is a projection of text.
 *
 * ## Ids in, positions out
 *
 * The grid holds ids because dnd-kit needs them; the edit layer takes positions
 * because a splice is about where something is written. Every case below either
 * resolves cleanly or hands the source back untouched: an id that no longer
 * names anything is a stale render, not an emergency.
 */

import * as edit from './edit.ts';
import {
	deliveryPositionOf,
	examplePositionOf,
	questionPositionOf,
	rulePositionOf,
} from './convert.ts';
import { splitCellKey, UNSCHEDULED, type BoardState, type Id } from './state.ts';
import type { BoardAction, QuestionParent } from './gestures.ts';
import type { ExampleMapDocument } from '../examplemap/model.ts';

/** The delivery an id names, as the title the file writes. Null is unscheduled. */
function bandTitle(d: ExampleMapDocument, band: string): string | null {
	if (band === UNSCHEDULED) return null;
	const index = deliveryPositionOf(band);
	return index === null ? null : (d.deliveries[index]?.title ?? null);
}

/** Which rule a question hangs from, or the story. */
function parentOf(parent: QuestionParent): number | 'story' | null {
	if ('story' in parent) return 'story';
	return rulePositionOf(parent.ruleId);
}

/**
 * The text this gesture produces, or the text unchanged when it cannot be placed.
 *
 * `import`, `applyText` and `reset` are not here: they replace the whole
 * document rather than editing one, so the board handles them directly.
 */
export function applyAction(
	source: string,
	d: ExampleMapDocument,
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

		case 'addStory':
			return edit.addStory(source, d, 'To be defined');

		case 'setStoryStatus':
			return edit.setStoryStatus(source, d, action.status);

		case 'setStoryNeed':
			return edit.setStoryNeed(source, d, action.field, action.text);

		case 'setStoryRelease':
			return edit.setStoryRelease(source, d, action.release === null ? null : bandTitle(d, action.release));

		case 'retitle': {
			if (action.kind === 'story') return edit.retitleStory(source, d, action.title);
			if (action.kind === 'rule') {
				const at = rulePositionOf(action.id);
				return at === null ? source : edit.retitleRule(source, d, at, action.title);
			}
			if (action.kind === 'example') {
				const at = examplePositionOf(action.id);
				return at === null ? source : edit.retitleExample(source, d, at, action.title);
			}
			const at = questionPositionOf(action.id);
			return at === null ? source : edit.retitleQuestion(source, d, at, action.title);
		}

		case 'setNotes': {
			const owner = nodeOf(d, action.kind, action.id);
			return edit.setNotes(source, d, owner, action.text);
		}

		case 'addRule':
			return edit.addRule(source, d, action.index);

		case 'addExample': {
			const at = rulePositionOf(action.ruleId);
			return at === null ? source : edit.addExample(source, d, at, bandTitle(d, action.band));
		}

		case 'addQuestion': {
			const parent = parentOf(action.parent);
			return parent === null ? source : edit.addQuestion(source, d, parent);
		}

		case 'addDelivery':
			return edit.addDelivery(source, d, action.kind, action.index);

		case 'retitleDelivery': {
			const at = deliveryPositionOf(action.id);
			return at === null ? source : edit.retitleDelivery(source, d, at, action.title);
		}

		case 'setDeliveryKind': {
			const at = deliveryPositionOf(action.id);
			return at === null ? source : edit.setDeliveryKind(source, d, at, action.kind);
		}

		case 'setDeliveryPoints': {
			const at = deliveryPositionOf(action.id);
			return at === null ? source : edit.setDeliveryPoints(source, d, at, action.points);
		}

		case 'setDeliveryNotes': {
			const at = deliveryPositionOf(action.id);
			return at === null ? source : edit.setNotes(source, d, d.deliveries[at], action.text);
		}

		case 'removeDelivery': {
			const at = deliveryPositionOf(action.id);
			return at === null ? source : edit.removeDelivery(source, d, at);
		}

		case 'moveDelivery': {
			const at = deliveryPositionOf(action.id);
			return at === null ? source : edit.moveDelivery(source, d, at, action.index);
		}

		case 'addStep': {
			const at = examplePositionOf(action.exampleId);
			return at === null ? source : edit.addStep(source, d, at, action.clause);
		}

		case 'setStep': {
			const at = examplePositionOf(action.exampleId);
			return at === null
				? source
				: edit.setStep(source, d, at, action.clause, action.index, action.text);
		}

		case 'remove': {
			if (action.kind === 'rule') {
				const at = rulePositionOf(action.id);
				return at === null ? source : edit.removeRule(source, d, at);
			}
			if (action.kind === 'example') {
				const at = examplePositionOf(action.id);
				return at === null ? source : edit.removeExample(source, d, at);
			}
			const at = questionPositionOf(action.id);
			return at === null ? source : edit.removeQuestion(source, d, at);
		}

		case 'moveRule': {
			const at = rulePositionOf(action.ruleId);
			return at === null ? source : edit.moveRule(source, d, at, action.index);
		}

		case 'moveExample': {
			const at = examplePositionOf(action.exampleId);
			const { ruleId, band } = splitCellKey(action.to);
			const rule = rulePositionOf(ruleId);
			if (at === null || rule === null) return source;
			return edit.moveExample(source, d, at, rule, action.index, bandTitle(d, band));
		}

		case 'moveQuestion': {
			const at = questionPositionOf(action.questionId);
			const to = parentOf(action.to);
			return at === null || to === null ? source : edit.moveQuestion(source, d, at, to, action.index);
		}

		// Handled by the board: these replace the document rather than edit it.
		case 'import':
		case 'applyText':
		case 'reset':
			return source;
	}
}

/** The node a `setNotes` is about, whatever kind it names. */
function nodeOf(d: ExampleMapDocument, kind: 'story' | 'rule' | 'example' | 'question', id: Id) {
	if (kind === 'story') return d.story ?? undefined;
	if (kind === 'rule') {
		const at = rulePositionOf(id);
		return at === null ? undefined : d.rules[at];
	}
	if (kind === 'example') {
		const at = examplePositionOf(id);
		return at === null ? undefined : d.rules[at.rule]?.examples[at.example];
	}
	const at = questionPositionOf(id);
	if (at === null) return undefined;
	return at.rule === 'story' ? d.story?.questions[at.question] : d.rules[at.rule]?.questions[at.question];
}

/** Whether this gesture is one `applyAction` can carry out. */
export function isEdit(action: BoardAction): boolean {
	return action.type !== 'import' && action.type !== 'applyText' && action.type !== 'reset';
}
