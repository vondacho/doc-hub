/**
 * The document model — an event storm exactly as the `.eventstorm` file spells it.
 *
 * Event storming is Alberto Brandolini's, and unlike the two boards next door it
 * is not one shape but three. The practice is run at three levels — Big Picture,
 * Process Modelling, Software Design — and each adds elements to the one before
 * it rather than replacing it. So this model has more kinds in it than doc-em's
 * four, and the kinds are grouped by the level that introduces them.
 *
 * As in doc-sm and doc-em, this is one of two models. This one is flat, has no
 * identifiers, and mirrors the grammar node for node; the board's model
 * (src/lib/board/state.ts) is normalised and carries generated ids.
 *
 * ## Only Big Picture is implemented
 *
 * `CardKind` below lists the Big Picture five and nothing else. The two deeper
 * levels are named here in prose rather than half-built in code: a `Command`
 * with no grammar behind it is a card you can place and cannot mean anything by,
 * which is worse than one that is not offered yet.
 *
 * When they arrive they are additive — new members of `CardKind`, new keywords,
 * new swatches — and nothing here has to change shape to admit them. That is why
 * the timeline holds a list of cards of any kind rather than a list of events
 * with decorations hanging off them.
 */

/**
 * The Big Picture notation: five colours, and Brandolini's own.
 *
 * They are the notation, not a palette. Somebody who has stood at one of these
 * walls has to recognise this board without being told, so — exactly as with
 * doc-em's four — these were never ours to choose.
 *
 *   - **Domain event**, orange. The backbone. Something that happened, written
 *     in the past tense and in the business's own words: `Order placed`,
 *     `Payment refused`. Everything else on the wall is scaffolding around
 *     these.
 *   - **Actor**, small yellow. A person or role who does something. Not a
 *     system, and not a department.
 *   - **External system**, pink. Something outside the boundary that events
 *     arrive from or are sent to.
 *   - **Hotspot**, red, and traditionally rotated forty-five degrees so it is
 *     visible from across a room. A problem, a disagreement, a thing nobody in
 *     the room can settle. The single most valuable card on the wall.
 *   - **Opportunity**, green. The other side of a hotspot: something worth
 *     doing that the timeline has just made visible.
 *
 * Process Modelling adds **command** (blue), **policy** (lilac) and **read
 * model** (green); Software Design adds the **aggregate** (pale yellow). None of
 * those is implemented yet — see the note at the top of this file.
 */
export type CardKind = 'event' | 'actor' | 'system' | 'hotspot' | 'opportunity';

/** Declaration order is the order the legend lists them, and the wall reads. */
export const CARD_KINDS: readonly CardKind[] = ['event', 'actor', 'system', 'hotspot', 'opportunity'];

export const cardLabel: Record<CardKind, string> = {
	event: 'Domain event',
	actor: 'Actor',
	system: 'External system',
	hotspot: 'Hotspot',
	opportunity: 'Opportunity',
};

/** Straight from the practice, and worth repeating on the board itself. */
export const cardMeaning: Record<CardKind, string> = {
	event: 'Something that happened, in the past tense and in the business’s words.',
	actor: 'A person or role who does something.',
	system: 'Something outside the boundary that events come from or go to.',
	hotspot: 'A problem or disagreement nobody in the room can settle.',
	opportunity: 'Something worth doing that the timeline has made visible.',
};

/** The DSL keyword each kind is written with. One word, and the same word back. */
export const cardKeyword: Record<CardKind, string> = {
	event: 'event',
	actor: 'actor',
	system: 'system',
	hotspot: 'hotspot',
	opportunity: 'opportunity',
};

export function isCardKind(value: unknown): value is CardKind {
	return typeof value === 'string' && (CARD_KINDS as readonly string[]).includes(value);
}

/**
 * One sticky note on the wall.
 *
 * A single node type for all five kinds rather than five interfaces, because on
 * a Big Picture wall they genuinely are the same thing: a coloured note with a
 * line of text on it, placed somewhere on a timeline. What differs is what the
 * colour *means*, and meaning is not structure.
 *
 * That will stop being true at the Software Design level, where an aggregate
 * gathers the commands it handles and the events it emits. When it does, this is
 * the type that gains children — not a parallel hierarchy beside it.
 */
export interface CardNode {
	readonly kind: CardKind;
	/** The words on the note. One line, in the room's own language. */
	readonly title: string;
	readonly notes: readonly string[];
}

/**
 * A stretch of the timeline: a run of cards that belong together.
 *
 * The practice's fourth phase is finding the seams — "clusters of events that
 * share a language and change together are candidate boundaries" — so the model
 * has somewhere to record a cluster once the room agrees on one. It is a *phase*
 * of the wall, not a bounded context: naming it a context would be claiming the
 * workshop's output before the workshop has produced it.
 *
 * Left to right is time. Declaration order is that order, with no index field,
 * for the reason the other two boards give: an explicit ordinal is a second copy
 * of what the list already says, and the copy is what drifts.
 */
export interface PhaseNode {
	readonly title: string;
	readonly notes: readonly string[];
	readonly cards: readonly CardNode[];
}

export interface EventStormDocument {
	readonly title: string;
	/**
	 * The registered product this storm is about, held as its **shortname**.
	 *
	 * The slug doc-registry assigns, not the display name — the name is editable
	 * in the CMS and the slug is the identity. `null` for a storm that is not
	 * about a registered product, which is an ordinary state: a workshop often
	 * runs before anything has been registered.
	 *
	 * There is no `space` beside it, unlike doc-sm and doc-em. A ticketing space
	 * is where work is raised, and an event storm does not produce work — it
	 * produces a shared picture and a set of seams. The story map next door is
	 * where the work is cut.
	 */
	readonly product: string | null;
	readonly notes: readonly string[];
	/**
	 * The wall, left to right.
	 *
	 * Always at least one phase, even on an empty board. The practice starts with
	 * a wall, and a wall exists before anybody has written on it — so a fresh
	 * board is one unnamed phase holding no cards, which is what gives the first
	 * `+` somewhere to be.
	 */
	readonly phases: readonly PhaseNode[];
}

/** What an unnamed phase is called. A wall before anybody has cut it up. */
export const UNNAMED_PHASE = 'The wall';

export function emptyDocument(title = 'Untitled event storm'): EventStormDocument {
	return { title, product: null, notes: [], phases: [emptyPhase()] };
}

export function emptyPhase(title = UNNAMED_PHASE): PhaseNode {
	return { title, notes: [], cards: [] };
}

/**
 * How wide a line of note text may be before it is broken.
 *
 * Fifty is a reading measure, not a screen measure — the same one doc-sm and
 * doc-em use, and for the same reason: it keeps a file legible in a diff, which
 * is where these are actually reviewed.
 */
export const NOTE_WRAP_COLUMNS = 50;

/**
 * Break a note's text into lines of at most NOTE_WRAP_COLUMNS characters.
 *
 * Idempotent, so it can be applied by the parser and again by the serializer
 * without the two fighting. Existing newlines are kept as hard breaks; a single
 * word longer than the measure is left to overflow rather than cut.
 */
export function wrapNote(text: string, columns = NOTE_WRAP_COLUMNS): string {
	return text
		.split('\n')
		.map((line) => wrapLine(line.trim(), columns))
		.join('\n');
}

function wrapLine(line: string, columns: number): string {
	if (line.length <= columns) return line;

	const out: string[] = [];
	let current = '';
	for (const word of line.split(/\s+/)) {
		if (word === '') continue;
		if (current === '') {
			current = word;
			continue;
		}
		if (current.length + 1 + word.length <= columns) current += ` ${word}`;
		else {
			out.push(current);
			current = word;
		}
	}
	if (current !== '') out.push(current);
	return out.join('\n');
}

/** One editable block of text, split back into separate notes. A blank line ends one. */
export function splitNotes(text: string): readonly string[] {
	return text
		.split(/\n[ \t]*\n+/)
		.map((note) => wrapNote(note.trim()))
		.filter((note) => note !== '');
}

/** The inverse: notes as one block, ready to edit. */
export function joinNotes(notes: readonly string[]): string {
	return notes.join('\n\n');
}
