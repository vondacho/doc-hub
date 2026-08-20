/**
 * The document model — a story map exactly as the `.storymap` file spells it.
 *
 * This is one of two models in doc-sm, and the split is deliberate. This one is
 * nested, has no identifiers, and mirrors the grammar node for node: it is what
 * `parse` produces and what `serialize` consumes. The board's model
 * (src/lib/board/state.ts) is normalised, carries generated ids, and knows about
 * cells and bands — things the file format has no opinion about.
 *
 * Keeping them apart costs one conversion module. It buys two things. The
 * parser stays reusable — doc-em and doc-es are coming, and a parser that knows
 * what a board cell is cannot be copied into them — and the whole board
 * vocabulary lives on one side of a single seam instead of leaking into the
 * file format.
 *
 * Revisit if src/lib/board/convert.ts ever degenerates into a field rename. At
 * that point the second model is ceremony and should be deleted.
 */

/**
 * The three kinds of card, and the only three. Colour is kind here: a card's
 * fill says what it is, and nothing else in doc-sm is tinted.
 */
export type CardKind = 'activity' | 'step' | 'story';

/**
 * A release, increment or phase — one horizontal band of the board.
 *
 * Declaration order in the file *is* band order, top to bottom. There is no
 * index field on purpose: an explicit ordinal is a second copy of the same
 * fact, and the copy is what drifts.
 */
export interface ReleaseNode {
	readonly title: string;
	readonly notes: readonly string[];
}

/** A user activity — the backbone, spanning one or more steps. */
export interface ActivityNode {
	readonly title: string;
	readonly notes: readonly string[];
	readonly steps: readonly StepNode[];
}

/** A user step — one column of the board, in narrative order left to right. */
export interface StepNode {
	readonly title: string;
	readonly notes: readonly string[];
	readonly stories: readonly StoryNode[];
}

/**
 * A user story.
 *
 * `release` holds a declared release *title*, not an index and not an id,
 * because the title is what the file writes after `@`. That is only sound
 * because duplicate release titles are a parse error — the two decisions stand
 * or fall together, so they are documented together (see resolve() in parser.ts).
 *
 * `null` means the story is not assigned to any release: Patton's below-the-line
 * backlog, the work that is known and not committed to. Absence is the
 * encoding — there is no `@none` sentinel to spell wrong.
 */
export interface StoryNode {
	readonly title: string;
	readonly notes: readonly string[];
	readonly release: string | null;
}

/**
 * A whole story map. One per file; a second `storymap` block is an error.
 */
export interface StoryMapDocument {
	readonly title: string;
	/**
	 * The registered product this map is about, held as its **shortname** — the
	 * `slug` doc-registry assigns, not the display name.
	 *
	 * The slug and not the name because the name is editable in the CMS and the
	 * slug is the identity: a map that recorded "Client Onboarding" would stop
	 * matching its product the day somebody fixed the capitalisation. It is also
	 * what a later reader would join on.
	 *
	 * `null` for a map that is not about a registered product — a spike, a
	 * workshop, a product that has not been registered yet. That is an ordinary
	 * state and not a missing value to be filled in.
	 */
	readonly product: string | null;
	readonly notes: readonly string[];
	readonly releases: readonly ReleaseNode[];
	readonly activities: readonly ActivityNode[];
}

/** The empty document a fresh board starts from. */
export function emptyDocument(title = 'Untitled story map'): StoryMapDocument {
	return { title, product: null, notes: [], releases: [], activities: [] };
}
