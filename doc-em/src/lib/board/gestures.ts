/**
 * The vocabulary of gestures.
 *
 * This was `reducer.ts`, and it deliberately no longer holds a reducer. The
 * text is the source of truth now: a gesture is not folded into a `BoardState`,
 * it is translated into a splice by `apply.ts` and written into the file.
 *
 * What survives is the *shape* of each gesture — the union below — because that
 * is the language the grid speaks. Keeping it is why `BoardGrid`, `Card`,
 * `DeliveryRail`, `ExampleSteps`, `StoryMeta` and `StoryNeed` did not change at
 * all: they still say what the visitor did, and something else decides what that
 * does to the text.
 */

import {
	type NeedField,
	type CardKind,
	type DeliveryKind,
	type StepClause,
	type StoryStatus,
} from '../examplemap/model.ts';
import type { BandId, CellKey, Id } from './state.ts';

/** Where a question hangs. The story, or one rule. */
export type QuestionParent = { readonly story: true } | { readonly ruleId: Id };

export type BoardAction =
	| { type: 'import'; text: string }
	/** Edited preview text: replaces the board but keeps the undo history. */
	| { type: 'applyText'; text: string }
	| { type: 'reset' }
	| { type: 'setMapTitle'; title: string }
	/**
	 * Pick the registered product, or clear it.
	 *
	 * Setting a product *initialises* the ticketing space when none has been
	 * stated, which saves typing the same word twice in the case where they
	 * agree — the usual one. It never overwrites a space that already holds a
	 * value: changing the product later leaves a settled space alone, because a
	 * ticket already raised into it carries a key from it, and quietly
	 * re-pointing the map at another space would strand it.
	 */
	| { type: 'setProduct'; product: string | null }
	| { type: 'setSpace'; space: string | null }
	/**
	 * Record a status against the story.
	 *
	 * The one ticketing field the board may write. The id beside it is
	 * deliberately not here — see `Story.ticket` in state.ts — so there is no
	 * action that changes it and no component that could offer one by mistake.
	 */
	/**
	 * Name the story this session is about.
	 *
	 * The board opens without one — see `Story` in state.ts — so this is the move
	 * that starts a session. Ignored when there already is a story: the practice
	 * takes one, and a second would be a second session.
	 */
	| { type: 'addStory' }
	| { type: 'setStoryStatus'; status: StoryStatus }
	/**
	 * Write one clause of the story's need. Blank text clears it.
	 *
	 * Cleared rather than stored as `""`, because the file distinguishes them: an
	 * omitted clause is one nobody has written, and there is no way to spell an
	 * empty one. Storing `""` would make the board hold a state the format cannot.
	 */
	| { type: 'setStoryNeed'; field: NeedField; text: string }
	| { type: 'retitle'; kind: CardKind; id: Id; title: string }
	| { type: 'setNotes'; kind: CardKind; id: Id; text: string }
	| { type: 'addRule'; index: number }
	/** The band is where the `+` was clicked; a new example is born scheduled. */
	| { type: 'addExample'; ruleId: Id; band: BandId }
	| { type: 'addDelivery'; kind: DeliveryKind; index: number }
	| { type: 'retitleDelivery'; id: Id; title: string }
	| { type: 'setDeliveryKind'; id: Id; kind: DeliveryKind }
	/** Size a sprint. `null` un-sizes it, which is not the same as sizing it 0. */
	| { type: 'setDeliveryPoints'; id: Id; points: number | null }
	| { type: 'setDeliveryNotes'; id: Id; text: string }
	/**
	 * Delete a band. Its examples are not deleted with it — they fall below the
	 * line, which is what cancelling a sprint actually does to the work in it.
	 */
	| { type: 'removeDelivery'; id: Id }
	| { type: 'moveDelivery'; id: Id; index: number }
	/** Which band the story ships in. `null` puts it back to uncommitted. */
	| { type: 'setStoryRelease'; release: Id | null }
	/** Open a step line on an example. The line starts empty; the author fills it. */
	| { type: 'addStep'; exampleId: Id; clause: StepClause }
	/** Write one step. Blank text deletes the line rather than storing nothing. */
	| { type: 'setStep'; exampleId: Id; clause: StepClause; index: number; text: string }
	| { type: 'addQuestion'; parent: QuestionParent }
	| { type: 'remove'; kind: Exclude<CardKind, 'story'>; id: Id }
	| { type: 'moveRule'; ruleId: Id; index: number }
	/** A drag between cells: rule and band may each change, independently. */
	| { type: 'moveExample'; exampleId: Id; from: CellKey; to: CellKey; index: number }
	| { type: 'moveQuestion'; questionId: Id; from: QuestionParent; to: QuestionParent; index: number };

/** Actions that open a different document; history.ts clears on these. */
export function resetsHistory(action: BoardAction): boolean {
	return action.type === 'import' || action.type === 'reset';
}
