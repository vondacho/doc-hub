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
 * Where the story is in the ticketing system's workflow.
 *
 * Six states, in workflow order — the order matters, because it is what a
 * reader expects a status list to be sorted in, and it is the order the menu
 * offers them. The same six doc-sm uses, and deliberately so: a story that
 * moves from a story map into an example mapping session does not change what
 * "ready" means on the way.
 *
 * **doc-em does not own this value.** The ticketing system does. A story that is
 * not linked to a ticket reads as `open`, which is a local placeholder rather
 * than a claim: nothing has been said about it yet. Once the story carries a
 * ticket id, whatever the ticketing system says is the truth, and anything
 * stored here is a cached copy of that.
 */
export type StoryStatus = 'open' | 'analysing' | 'ready' | 'in-progress' | 'done' | 'closed';

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
 * A sprint or a release — the two kinds of delivery, and the whole time axis.
 *
 * One type with a kind rather than two types, because a sprint *is* a release in
 * every way this board cares about: it is a dated thing that work is committed
 * to, it sits at a point on a timeline, and cards are placed in it. The only
 * difference is scale, and scale is a word, not a structure.
 *
 * What the kinds are for is reading. A board with four sprints and one release
 * says something a board with five equal bands does not — that four of them are
 * steps towards the fifth. The story ships in the release; its examples ship in
 * the sprints along the way.
 */
export type DeliveryKind = 'sprint' | 'release';

export const DELIVERY_KINDS: readonly DeliveryKind[] = ['sprint', 'release'];

export const deliveryKindLabel: Record<DeliveryKind, string> = {
	sprint: 'Sprint',
	release: 'Release',
};

export function isDeliveryKind(value: unknown): value is DeliveryKind {
	return typeof value === 'string' && (DELIVERY_KINDS as readonly string[]).includes(value);
}

/**
 * One band of the board: a sprint or a release, and the work placed in it.
 *
 * **Declaration order is timeline order**, top to bottom. There is no date field
 * and no index, for the reason doc-sm gives about its releases: an explicit
 * ordinal is a second copy of a fact the list already states, and the copy is
 * what drifts. A board is re-ordered by moving a band, not by editing a number.
 *
 * No dates, either. A date on a sprint would be the one thing here that goes
 * stale on its own, and it would make the file wrong rather than merely old. The
 * tracker holds the calendar; this holds the sequence.
 */
export interface DeliveryNode {
	readonly title: string;
	readonly kind: DeliveryKind;
	/**
	 * The ticket this band is in the tracker — a Jira version or sprint id, or
	 * whatever the connected system calls the thing work is committed to.
	 *
	 * A band is a real object over there, not just a word on this board: a sprint
	 * has a number, a release has a version, and both are things you can open. So
	 * it carries an id for the same reason the story does, spelled the same way
	 * and owned by the same system.
	 *
	 * Held whole rather than composed from the map's `space`, for the story's
	 * reason: the tracker issues this identifier and doc-em does not, so building
	 * half of it here would mean inventing part of a name somebody else owns.
	 *
	 * `null` means not linked, which is the state every band starts in — one added
	 * from the toolbar is a plan, and a plan exists before a tracker knows about
	 * it.
	 *
	 * **Editable in the DSL and nowhere else**, exactly like the story's. The rail
	 * shows it and will not let it be typed over: a mistyped id silently points a
	 * whole sprint's worth of examples at the wrong thing, with no symptom on the
	 * board. Changing it is an edit to the file, where it is deliberate and shows
	 * up in a diff.
	 */
	readonly ticket: string | null;
	/**
	 * How big this sprint is, in story points, or `null` for one nobody has sized.
	 *
	 * **Sprints only.** A release is a date somebody committed to, and the work
	 * inside it is the sprints that lead there — so sizing it would either
	 * double-count those sprints or state a second, competing number for the same
	 * work. `points` on a `release` is a parse error rather than a value that is
	 * quietly ignored, and three things keep the two in step: the parser refuses
	 * it, changing a band to a release clears it, and the serializer will not
	 * write it. The last of those is what makes an unparseable export
	 * unreachable rather than merely unlikely.
	 *
	 * A flat field rather than a `kind`-discriminated union. The union would make
	 * the invalid state unrepresentable, which is the stronger guarantee, but it
	 * would put a narrowing branch in front of every read of every *other* field
	 * on this type — title, ticket, notes — to buy an invariant that is enforced
	 * in three cheap places already. Worth revisiting if a second sprint-only
	 * field ever appears.
	 *
	 * The band's own estimate, not a sum of what is in it. doc-em does not
	 * estimate examples — the practice does not ask anyone to, and a board that
	 * put a number on every green card would be inviting a different meeting than
	 * the one it is for. This is the number a team commits to for a sprint, put
	 * where the sprint is.
	 *
	 * **Editable on the board and in the file**, unlike the `ticket` above it. The
	 * two are different kinds of fact: the id is issued by the tracker and doc-em
	 * only records it, while the size is decided in the room and changes while the
	 * conversation is still happening. That is the same line the story's `status`
	 * and `ticket` fall on either side of.
	 *
	 * A non-negative integer. The scale teams actually use is Fibonacci — 1, 2, 3,
	 * 5, 8 — so halves buy nothing, and admitting them would mean either quoting
	 * the number in the file or teaching the scanner about `.` for a case nobody
	 * has. `0` is allowed and is a real answer: a sprint that carries no estimable
	 * work is not the same as one nobody has sized.
	 */
	readonly points: number | null;
	readonly notes: readonly string[];
}

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
	/**
	 * The delivery this example ships in, by declared **title**, or `null` for one
	 * nobody has committed to yet.
	 *
	 * A title rather than an index or an id, because the title is what the file
	 * writes after `@`. That is only sound because duplicate delivery titles are a
	 * parse error — the two decisions stand or fall together, so they are
	 * documented together (see resolve() in parser.ts).
	 *
	 * `null` is the below-the-line band: examples that are agreed and not yet
	 * scheduled. Absence is the encoding — there is no `@none` sentinel to spell
	 * wrong — and it is an ordinary state rather than a missing value. Most
	 * examples are born there.
	 *
	 * ## Why this hangs on the example and not the rule
	 *
	 * Because the example is the unit that ships. A rule is a constraint, and a
	 * constraint is not delivered in a sprint; the concrete cases that satisfy it
	 * are, one at a time, and a rule is finished when the last of them lands. That
	 * is what makes an example the smallest thing on this board with business
	 * value attached — and it is why the time axis crosses the rules rather than
	 * ordering them.
	 */
	readonly delivery: string | null;
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
	/**
	 * The ticket this story is linked to, exactly as the ticketing system spells
	 * it — `CLONB-42`, or whatever that system returns.
	 *
	 * Stored whole rather than as a suffix composed with the map's `product`,
	 * for doc-sm's reason: the ticketing system issues this identifier and doc-em
	 * does not, so reconstructing half of it here would mean inventing part of a
	 * name another system owns.
	 *
	 * `null` means not linked, which is the state every map starts in.
	 *
	 * **Editable in the DSL and nowhere else.** The board shows it and will not
	 * let it be typed over. An example mapping session refines a story; it does
	 * not re-address one, and a mistyped id silently points a whole map of rules
	 * at somebody else's ticket. Changing it is a deliberate act of editing the
	 * file — which is also where the mistake is reviewable in a diff.
	 */
	readonly ticket: string | null;
	/**
	 * A cached copy of the ticket's status, or `open` for a story with no ticket.
	 *
	 * Editable from the board *and* the DSL, unlike the id beside it. The two are
	 * different kinds of fact: the id says which ticket this is, and the status
	 * says how far along it is. The second is the one a session actually changes
	 * — a map whose rules are agreed and whose questions are answered is what
	 * "ready" means — so it is worth one click.
	 *
	 * Still not authoritative: when the story is linked, the ticketing system's
	 * answer wins, and this is what was last heard from it.
	 */
	readonly status: StoryStatus;
	/**
	 * The delivery this story ships in, by declared title, or `null` when nobody
	 * has committed to one.
	 *
	 * Expected to name a **release** rather than a sprint — the story is the whole
	 * of what the session is about, and it is done when every example under it is
	 * done. Naming a sprint is allowed and flagged on the board rather than
	 * refused here; see `scheduleWarnings`.
	 */
	readonly release: string | null;
	/**
	 * The need behind the title, in the formal story language: as a <persona>,
	 * I want <want>, so that <soThat>.
	 *
	 * Modelled in three fields rather than written as prose in a note, because
	 * each of the three is a different kind of thing, and because the `so that`
	 * clause is the half that gets dropped first and missed most. A story with a
	 * title and no need is a to-do item that has forgotten what it was for — and
	 * an example mapping session spends its whole length asking what a story
	 * actually means, so the answer belongs on the card being discussed.
	 *
	 * All three are optional and independently so. A board opens with none of
	 * them, and a session that has agreed the persona but not the outcome is an
	 * ordinary state rather than an incomplete one.
	 *
	 * ## The persona is free text here, and a reference in doc-sm
	 *
	 * There, a story may only name a persona its own activity lists, so the
	 * board offers exactly those and the parser rejects any other — the cast is
	 * declared once and cannot drift.
	 *
	 * There is no cast on this board. Example mapping takes one story that some
	 * other conversation already chose, and a map that had to declare its
	 * personas before naming one would be asking the room to invent a structure
	 * the technique does not have. So it is a string somebody types, and the
	 * card edits it as text rather than offering a list of choices that do not
	 * exist.
	 */
	readonly persona: string | null;
	readonly want: string | null;
	readonly soThat: string | null;
	/** Questions raised before any rule existed: doubts about the story itself. */
	readonly questions: readonly QuestionNode[];
}

export interface ExampleMapDocument {
	readonly title: string;
	/**
	 * The registered product this map is about, held as its **shortname** — the
	 * `slug` doc-registry assigns, not the display name.
	 *
	 * The slug and not the name because the name is editable in the CMS and the
	 * slug is the identity: a map that recorded "Client Onboarding" would stop
	 * matching its product the day somebody fixed the capitalisation.
	 *
	 * `null` for a map that is not about a registered product — a spike, a
	 * workshop, a product that has not been registered yet. That is an ordinary
	 * state and not a missing value to be filled in.
	 */
	readonly product: string | null;
	/**
	 * The ticketing space this story is raised into — a Jira project key, or
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
	 * changing the product does not re-derive it, because a ticket already
	 * raised carries a key from the old space.
	 */
	readonly space: string | null;
	readonly notes: readonly string[];
	/**
	 * The time axis, in order, earliest first.
	 *
	 * Empty is the ordinary state for a map that has not been scheduled — an
	 * example mapping session produces rules and examples, and deciding when they
	 * ship is a different conversation on a different day. A board with no
	 * deliveries shows no bands at all rather than one empty one.
	 */
	readonly deliveries: readonly DeliveryNode[];
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
		product: null,
		space: null,
		notes: [],
		deliveries: [],
		story: emptyStory(),
		rules: [],
	};
}

/**
 * The story card a board opens with: named `To be defined`, linked to nothing.
 *
 * One function rather than the literal written out at each of the three places
 * that needs it — the empty document, the parser's fallback for a map with no
 * `story` line, and the parser's blank document — so adding a field to
 * `StoryNode` cannot leave one of them behind.
 */
export function emptyStory(title = UNDEFINED_STORY): StoryNode {
	return {
		title,
		notes: [],
		ticket: null,
		status: DEFAULT_STORY_STATUS,
		release: null,
		persona: null,
		want: null,
		soThat: null,
		questions: [],
	};
}

/**
 * The three clauses, as the card draws them: one line each.
 *
 * A line per clause rather than one composed sentence, because the DSL models
 * them as three fields and the card should show what the file holds. It is also
 * what makes them individually editable — a sentence can only be replaced whole,
 * where three lines can each be corrected on their own.
 *
 * Each line wraps on its own. `prefix` is fixed prose the reader never edits;
 * `value` is the part that is theirs. A clause nobody has written yet still
 * produces a line, shown muted, so the shape of a need is visible before
 * anybody has typed into it — the same way an example card shows its
 * Given/When/Then template.
 *
 * Ported from doc-sm's model, where the same three lines mean the same three
 * things. Only the persona differs, and it differs in the component rather than
 * here: see `StoryNode.persona`.
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
		{
			field: 'soThat',
			prefix: 'so that ',
			value: story.soThat,
			placeholder: 'some outcome',
			suffix: '.',
		},
	];
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

/** "a" or "an". Small, and its absence is the kind of thing that reads as sloppy. */
function article(word: string): string {
	return /^[aeiou]/i.test(word.trim()) ? 'an' : 'a';
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
