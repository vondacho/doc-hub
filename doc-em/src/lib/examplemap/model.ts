/**
 * The document model — an example map exactly as the `.examplemap` file spells it.
 *
 * Example mapping is Matt Wynne's, and the practice is unusually precise about
 * its own shape: a timeboxed conversation that takes **one** story and breaks it
 * into four kinds of card. That precision is why this model has so little in it.
 * There are four kinds and no more, the story is singular, and examples belong to
 * a rule rather than floating.
 *
 * As in doc-sm, this is one of two models. This one is nested, has no
 * identifiers, and mirrors the grammar node for node; the board's model
 * (src/lib/board/state.ts) is normalised and carries generated ids. Keeping them
 * apart is what lets the parser be copied again, into doc-es.
 */

/**
 * The four colours, and the whole vocabulary of the technique.
 *
 * Order matters: it is the order they are written on the wall, and the order the
 * legend lists them.
 */
export type CardKind = 'story' | 'rule' | 'example' | 'question';

export const CARD_KINDS: readonly CardKind[] = ['story', 'rule', 'example', 'question'];

export const cardLabel: Record<CardKind, string> = {
	story: 'Story',
	rule: 'Rule',
	example: 'Example',
	question: 'Question',
};

/** Straight from the practice, and worth repeating on the board itself. */
export const cardMeaning: Record<CardKind, string> = {
	story: 'The one under discussion. There is exactly one.',
	rule: 'A constraint or acceptance criterion.',
	example: 'A concrete case illustrating a rule — real values, not "some input".',
	question: 'Something nobody in the room can answer.',
};

export interface ExampleNode {
	readonly title: string;
	readonly notes: readonly string[];
}

export interface QuestionNode {
	readonly title: string;
	readonly notes: readonly string[];
}

export interface RuleNode {
	readonly title: string;
	readonly notes: readonly string[];
	readonly examples: readonly ExampleNode[];
	/**
	 * Questions raised while discussing this rule.
	 *
	 * Kept against the rule rather than in a pile, because the finished map is
	 * meant to be *read*: "this rule has three unanswered questions" is a
	 * different and more useful statement than "the board has three questions".
	 */
	readonly questions: readonly QuestionNode[];
}

/**
 * The story under discussion. There is exactly one, always.
 *
 * Not optional and not a list. A board opens with a placeholder rather than with
 * nothing, because a session that has not named its story has not started — and
 * because the practice is defined as taking *one* story.
 */
export interface StoryNode {
	readonly title: string;
	readonly notes: readonly string[];
	/** Questions raised before any rule existed: doubts about the story itself. */
	readonly questions: readonly QuestionNode[];
}

export interface ExampleMapDocument {
	readonly title: string;
	readonly notes: readonly string[];
	readonly story: StoryNode;
	readonly rules: readonly RuleNode[];
}

/** What a board starts as, and what an empty story card says. */
export const UNDEFINED_STORY = 'To be defined';

export function emptyDocument(title = 'Untitled example map'): ExampleMapDocument {
	return {
		title,
		notes: [],
		story: { title: UNDEFINED_STORY, notes: [], questions: [] },
		rules: [],
	};
}

/**
 * How wide a line of note text may be before it is broken.
 *
 * Fifty is a reading measure, not a screen measure — the same one doc-sm uses,
 * and for the same reason: it keeps a file legible in a diff, which is where
 * these are actually reviewed.
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
