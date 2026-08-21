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
 * Where a story is in the ticketing system's workflow.
 *
 * Six states, in workflow order — the order matters, because it is what a
 * reader expects a status list to be sorted in, and it is the order the menu
 * offers them.
 *
 * **doc-sm does not own this value.** The ticketing system does. A story that is
 * not linked to a ticket reads as `open`, which is a local placeholder rather
 * than a claim: nothing has been said about it yet. Once a story carries a
 * ticket id, whatever the ticketing system says is the truth, and anything
 * stored here is a cached copy of that — see `ticket` below.
 */
export type StoryStatus = 'open' | 'analysing' | 'ready' | 'in-progress' | 'done' | 'closed';

/**
 * What kind of ticket a card becomes.
 *
 * A step is an epic and a story is a story. The adapter needs to be told which,
 * because the two are different issue types in every tracker there is, and
 * guessing from the title would be absurd.
 */
export type TicketKind = 'epic' | 'story';

/** In workflow order. The slug is what the DSL writes after `~`. */
export const STORY_STATUSES: readonly StoryStatus[] = [
	'open',
	'analysing',
	'ready',
	'in-progress',
	'done',
	'closed',
];

export const storyStatusLabel: Record<StoryStatus, string> = {
	open: 'Open',
	analysing: 'Analysing',
	ready: 'Ready',
	'in-progress': 'In progress',
	done: 'Done',
	closed: 'Closed',
};

/** The state a story starts in, and the one it keeps until a ticket exists. */
export const DEFAULT_STORY_STATUS: StoryStatus = 'open';

export function isStoryStatus(value: unknown): value is StoryStatus {
	return typeof value === 'string' && (STORY_STATUSES as readonly string[]).includes(value);
}

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
	/**
	 * Who this activity is for — its cast, listed on the activity itself.
	 *
	 * Personas live here rather than at map level because an activity is where
	 * the question actually gets asked: "who is doing this?" is answered once per
	 * thing people do, not once per product. It also puts the answer where it is
	 * read — the backbone card carries the list, so scanning the top row of a
	 * board tells you whose map this is.
	 *
	 * Referenced by title from the stories underneath, and only from those: a
	 * story may name a persona its own activity lists and no other. That is what
	 * keeps the list a real cast rather than a decoration — if a story is for
	 * somebody the activity never mentioned, one of the two is wrong.
	 */
	readonly personas: readonly string[];
	readonly steps: readonly StepNode[];
}

/**
 * A user step — one column of the board, in narrative order left to right.
 *
 * A step is the natural shape of an **epic**: a thing people do, made of the
 * stories underneath it. So it carries the same two fields a story does, and
 * they mean the same thing — the ticketing system issues the id, doc-sm never
 * does, and the status is a cache of what that system last said.
 *
 * What a step does *not* have is a release. A step spans every band; the
 * decision about when work happens is made one level down, on the stories.
 */
export interface StepNode {
	readonly title: string;
	readonly notes: readonly string[];
	readonly ticket: string | null;
	readonly status: StoryStatus;
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
	/**
	 * The need behind the title, in the formal story language: as a <persona>,
	 * I want <want>, so that <soThat>.
	 *
	 * Modelled in three fields rather than written as prose in a note, because
	 * each of the three is a different kind of thing. `persona` is a *reference*
	 * to something declared once, so it cannot drift; `want` and `soThat` are the
	 * story's own words.
	 *
	 * The `so that` clause earns its place in the model: it is the half that gets
	 * dropped first and missed most, and doc-portal's product view already
	 * promises to keep it "intact from the story file". A field it can be read
	 * from is what makes that promise keepable.
	 *
	 * All three are optional and independently so. A story with a title and
	 * nothing else is where every card starts, and a workshop that has agreed the
	 * persona but not yet the outcome is an ordinary state rather than an
	 * incomplete one.
	 */
	readonly persona: string | null;
	readonly want: string | null;
	readonly soThat: string | null;
	/**
	 * The ticket this story is linked to, exactly as the ticketing system spells
	 * it — `client-onboarding-42`, or whatever that system returns.
	 *
	 * Stored whole rather than as a suffix composed with the map's `product`,
	 * even though that repeats the product on every line. The ticketing system
	 * issues this identifier and doc-sm does not; reconstructing half of it here
	 * would mean inventing part of a name another system owns, and it would break
	 * the day a project key stops matching a product shortname.
	 *
	 * `null` means not linked, which is the state every story starts in. doc-sm
	 * never fills this in by itself — see the note on `status`.
	 */
	readonly ticket: string | null;
	/**
	 * A cached copy of the ticket's status, or `open` for a story with no ticket.
	 *
	 * Editable here and in the DSL because a file has to be able to carry it, and
	 * because a board is useful offline. It is still not authoritative: when a
	 * story is linked, the ticketing system's answer wins, and this is what was
	 * last heard from it.
	 */
	readonly status: StoryStatus;
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
	/**
	 * The ticketing space these stories are raised into — a Jira project key, or
	 * whatever the connected tracker calls the container an issue belongs to.
	 *
	 * `null` means "not stated", and then the product shortname stands in; see
	 * `effectiveSpace`. The two are usually the same, which is why this is not
	 * simply required — writing the same word twice on every map would make the
	 * common case noisy in order to serve the uncommon one.
	 *
	 * They do come apart. A tracker whose project key is `CLONB` while the
	 * registry knows the product as `client-onboarding`, or two products raised
	 * into one shared space, are both ordinary. Once set, it is left alone:
	 * changing the product does not re-derive it, because tickets already raised
	 * carry keys from the old space and silently re-pointing the map at a
	 * different one would strand them.
	 */
	readonly space: string | null;
	readonly notes: readonly string[];
	readonly releases: readonly ReleaseNode[];
	readonly activities: readonly ActivityNode[];
}

/**
 * How wide a line of note text may be before it is broken.
 *
 * Fifty is a reading measure, not a screen measure. Note text is prose, and
 * prose is read in lines of roughly this length in every typeset thing there
 * has ever been; it also keeps a `.storymap` file legible in a diff, which is
 * where these notes are actually reviewed.
 */
export const NOTE_WRAP_COLUMNS = 50;

/**
 * One editable block of text, split back into separate notes.
 *
 * A blank line ends a note. That is the whole rule, and it is the only one that
 * survives a round trip: notes render joined by a blank line, so what somebody
 * sees in the editor is exactly what splitting will read back. A single newline
 * stays inside its note, which is what makes a list — or a wrapped sentence —
 * one note rather than four.
 *
 * Each note is wrapped to the measure on the way in, so text typed into a card
 * obeys the same rule as text read from a file.
 */
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

/**
 * Break a note's text into lines of at most NOTE_WRAP_COLUMNS characters.
 *
 * **Idempotent**, which is what allows it to be applied in two places without
 * the two fighting: the parser normalises what it reads, so the board shows the
 * breaks the file will have, and the serializer applies it again so a note that
 * never came from a file still obeys the rule. Wrapping already-wrapped text
 * returns it unchanged.
 *
 * Existing newlines are kept as hard breaks and each stretch between them is
 * wrapped on its own, so a deliberate paragraph break survives. A single word
 * longer than the measure is left to overflow rather than being cut — a URL
 * broken in half is worse than a long line.
 *
 * Runs of whitespace collapse to one space. That is what makes the result
 * deterministic, and note text is prose rather than layout.
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

/**
 * The need, as one sentence, or null when nothing has been said about it.
 *
 * Composed rather than stored, so the three fields stay the single record of it
 * and cannot disagree with a cached sentence. Partial needs compose to partial
 * sentences: a story that names a persona and a want but no outcome reads as far
 * as it has been thought through, which is more honest than hiding it until
 * somebody fills in the third box.
 */
export function composeNeed(story: {
	persona: string | null;
	want: string | null;
	soThat: string | null;
}): string | null {
	const clauses: string[] = [];
	if (story.persona !== null) clauses.push(`As ${article(story.persona)} ${story.persona}`);
	if (story.want !== null) clauses.push(`I want ${story.want}`);
	if (story.soThat !== null) clauses.push(`so that ${story.soThat}`);
	if (clauses.length === 0) return null;
	return `${clauses.join(', ')}.`;
}

/**
 * The three clauses, as the board draws them: one line each.
 *
 * A line per clause rather than one composed sentence, because the DSL models
 * them as three fields and the card should show what the file holds. It is also
 * what makes them individually editable — a sentence can only be replaced whole,
 * where three lines can each be corrected on their own.
 *
 * Each line wraps on its own. `prefix` is fixed prose the reader never edits;
 * `value` is the part that is theirs.
 */
export type NeedField = 'persona' | 'want' | 'soThat';

export interface NeedLine {
	readonly field: NeedField;
	readonly prefix: string;
	readonly value: string | null;
	/** Shown, muted, when the clause has not been written yet. */
	readonly placeholder: string;
	/** Trailing punctuation, so the three read as one sentence when all are there. */
	readonly suffix: string;
}

export function needLines(story: {
	persona: string | null;
	want: string | null;
	soThat: string | null;
}): readonly NeedLine[] {
	return [
		{
			field: 'persona',
			prefix: `As ${article(story.persona ?? 'a')} `,
			value: story.persona,
			placeholder: 'somebody',
			suffix: ',',
		},
		{ field: 'want', prefix: 'I want ', value: story.want, placeholder: 'something', suffix: ',' },
		{ field: 'soThat', prefix: 'so that ', value: story.soThat, placeholder: 'some outcome', suffix: '.' },
	];
}

/** "a" or "an". Small, and its absence is the kind of thing that reads as sloppy. */
function article(word: string): string {
	return /^[aeiou]/i.test(word.trim()) ? 'an' : 'a';
}

/**
 * Where tickets for this map are raised: the stated space, or the product.
 *
 * One function, used by the board, the publisher and the serializer alike, so
 * there is exactly one answer to "which space is this?" rather than three
 * places each deciding for themselves.
 */
export function effectiveSpace(map: { space: string | null; product: string | null }): string | null {
	return map.space ?? map.product;
}

/** The empty document a fresh board starts from. */
export function emptyDocument(title = 'Untitled story map'): StoryMapDocument {
	return { title, product: null, space: null, notes: [], releases: [], activities: [] };
}
