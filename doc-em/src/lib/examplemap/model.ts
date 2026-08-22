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

/**
 * The three clauses of a Gherkin step, in the only order Gherkin allows them.
 *
 * Order is not a style choice here: `Given` establishes context, `When` is the
 * one action under test, `Then` is what must be true afterwards. A file that
 * wrote them in another order would not be Gherkin, so the serializer emits
 * these buckets in this order regardless of the order they were typed in.
 */
export type StepClause = 'given' | 'when' | 'then';

export const STEP_CLAUSES: readonly StepClause[] = ['given', 'when', 'then'];

export const clauseKeyword: Record<StepClause, string> = {
	given: 'Given',
	when: 'When',
	then: 'Then',
};

/**
 * A concrete case illustrating a rule.
 *
 * The title is the card as it is written on the wall — one line, in the room's
 * own words. The three step buckets are what that line means in Gherkin, and
 * they are optional: a session that produced ten example titles and no steps did
 * example mapping correctly. The steps are for the ones somebody has since sat
 * down and made precise.
 *
 * **Each clause is a list, not a string.** One `When` is the common case and two
 * is usually a sign the example is really two examples — but `Given` genuinely
 * accumulates ("a voucher that expired yesterday" *and* "a basket of 40 CHF"),
 * and so does `Then`. Modelling all three the same way costs nothing and avoids
 * a rule about which of them may repeat.
 *
 * **There is no `and` here, and that is deliberate.** Gherkin's `And` is a
 * rendering of "another step of the same kind as the one above it", so it is
 * derived on the way out — see `stepLines` and `toGherkin`. Storing it would
 * make the meaning of a step depend on the step before it, and reordering two
 * lines would then silently change what they assert.
 */
export interface ExampleNode {
	readonly title: string;
	readonly notes: readonly string[];
	readonly given: readonly string[];
	readonly when: readonly string[];
	readonly then: readonly string[];
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

/**
 * One rendered step line: the keyword to print, and the text beside it.
 *
 * The guidance the card shows, in other words — and it has to know about
 * accumulation, because the second `Given` in a row is written `And`. Deriving
 * that here rather than in the component means the board, the Gherkin writer and
 * anything built later all say `And` in the same places.
 *
 * A clause nobody has written yet still produces one line, with `value: null`
 * and a placeholder. That is the template: an example card shows
 *
 *     Given some context
 *     When something happens
 *     Then an outcome
 *
 * in grey until the words are filled in, the same way doc-sm shows an unwritten
 * "As a … I want … so that …". A blank card that had to be told what shape to be
 * teaches nothing.
 */
export interface StepLine {
	readonly clause: StepClause;
	/** Position within its own clause. Also the index a reducer edits. */
	readonly index: number;
	/** `Given`/`When`/`Then` for the first of a clause, `And` for every one after. */
	readonly keyword: string;
	readonly value: string | null;
	readonly placeholder: string;
}

const stepPlaceholder: Record<StepClause, readonly [string, string]> = {
	given: ['some context', 'more context'],
	when: ['something happens', 'something else happens'],
	then: ['an outcome', 'another outcome'],
};

/**
 * The step lines to render for one example, template lines included.
 *
 * Always at least three — one per clause — so the shape of a scenario is visible
 * before anybody has typed into it. An entry that is the empty string is a line
 * somebody opened and has not written yet; it renders as a placeholder and is
 * dropped on the way to the file.
 */
export function stepLines(example: {
	given: readonly string[];
	when: readonly string[];
	then: readonly string[];
}): readonly StepLine[] {
	const lines: StepLine[] = [];

	for (const clause of STEP_CLAUSES) {
		const written = example[clause];
		const [first, more] = stepPlaceholder[clause];

		if (written.length === 0) {
			lines.push({ clause, index: 0, keyword: clauseKeyword[clause], value: null, placeholder: first });
			continue;
		}
		written.forEach((text, index) => {
			lines.push({
				clause,
				index,
				keyword: index === 0 ? clauseKeyword[clause] : 'And',
				value: text.trim() === '' ? null : text,
				placeholder: index === 0 ? first : more,
			});
		});
	}

	return lines;
}

/** Whether an example has any step written — an empty entry does not count. */
export function hasSteps(example: {
	given: readonly string[];
	when: readonly string[];
	then: readonly string[];
}): boolean {
	return STEP_CLAUSES.some((clause) => example[clause].some((text) => text.trim() !== ''));
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
