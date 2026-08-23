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
 * Which level of the practice this storm is being run at.
 *
 * Event storming is not one workshop but three, and each **adds** to the one
 * before it rather than replacing it. That containment is the whole reason this
 * is one board with a setting rather than three boards: a process model is a big
 * picture with commands and policies on it, and a software design is a process
 * model with aggregates on it. Raising the level never invalidates what is
 * already on the wall.
 *
 *   - **Big picture** — explore a domain nobody has agreed on yet. The output is
 *     a shared understanding and a set of seams.
 *   - **Process modelling** — take one process end to end. The notation gains
 *     the causal chain: `event → policy → command → system → event`.
 *   - **Software design** — zoom into one bounded context and shape the
 *     components inside it.
 */
export type Level = 'big-picture' | 'process-modelling' | 'software-design';

/** In order of depth. Each admits everything the one before it does. */
export const LEVELS: readonly Level[] = ['big-picture', 'process-modelling', 'software-design'];

export const levelLabel: Record<Level, string> = {
	'big-picture': 'Big picture',
	'process-modelling': 'Process modelling',
	'software-design': 'Software design',
};

export const levelMeaning: Record<Level, string> = {
	'big-picture': 'Explore a whole domain. Events, who is involved, and what nobody agrees on.',
	'process-modelling': 'One process end to end: what triggers what, and who decides.',
	'software-design': 'Inside one context: the components, and what each is responsible for.',
};

export function isLevel(value: unknown): value is Level {
	return typeof value === 'string' && (LEVELS as readonly string[]).includes(value);
}

/**
 * The notation, level by level. Ten kinds, and Brandolini's own.
 *
 * They are the notation, not a palette. Somebody who has stood at one of these
 * walls has to recognise this board without being told, so — exactly as with
 * doc-em's four — these were never ours to choose.
 *
 * **Big picture**, five:
 *   - **Domain event**, orange. The backbone. Something that happened, written
 *     in the past tense and in the business's own words: `Order placed`,
 *     `Payment refused`.
 *   - **Actor**, yellow. A person or role who does something.
 *   - **External system**, magenta. Something outside the boundary that events
 *     arrive from or are sent to.
 *   - **Hotspot**, red. A problem, a disagreement, a thing nobody in the room
 *     can settle. The single most valuable card on the wall.
 *   - **Opportunity**, green. The other side of a hotspot.
 *   - **Bounded context**, slate. Where one model's language stops and the next
 *     begins.
 *
 * **Process modelling** adds three, and together they are the causal chain the
 * level exists to draw — `event → policy → command → system → event`:
 *   - **Command**, blue. A request to do something, in the imperative.
 *   - **Policy**, violet. The rule that reacts to an event and issues a command:
 *     "whenever X, do Y".
 *   - **Read model**, teal. The information somebody needs in order to decide.
 *
 * **Software design** adds two:
 *   - **Aggregate**, pale yellow. The component that accepts commands and emits
 *     events. It is what an external system becomes once the work moves inside
 *     the boundary.
 *   - **Screen**, white. What a person looks at to decide, and acts through. It
 *     is the missing half of the human path the level before it draws: a policy
 *     that needs a person becomes `read model → screen → command`, and without
 *     somewhere to put the screen that chain has a hole in it where the person
 *     goes.
 *
 * Called a *screen* on the board and `ui` in the file. The practice's own word is
 * "UI", which is right in a room and wrong in a legend — two letters of jargon
 * where the reader wants a noun. The keyword stays `ui` because that is what
 * somebody hand-editing the file will type.
 *
 * ## Why the bounded context is a big-picture card
 *
 * It sat at software design in the first draft of this model, following a guide
 * that lists "aggregates, commands, and bounded contexts" as that level's
 * additions. That was the wrong reading. Finding the seams is the *last phase of
 * a big picture*: "clusters of events that share a language and change together
 * are candidate boundaries — this is the output the architecture uses". A room
 * that has just spent an afternoon discovering two departments mean different
 * things by "account" has found a context boundary, and it needs somewhere to
 * write it down long before anybody talks about aggregates.
 *
 * Software design is where you go *inside* one of them, which is why the
 * aggregate is the one card that arrives there. Listing it last in the
 * big-picture group matches the order the phases run in: events, then the
 * timeline, then the causes, then the seams.
 *
 * The physical notation draws a context as a boundary around notes rather than
 * as a note. It is a card here because this board has no way to draw a region —
 * a limitation worth knowing rather than a reading of the practice.
 */
export type CardKind =
	| 'event'
	| 'actor'
	| 'system'
	| 'hotspot'
	| 'opportunity'
	| 'command'
	| 'policy'
	| 'readmodel'
	| 'aggregate'
	| 'ui'
	| 'context';

/** Which level first admits each kind. Cumulative: see `kindsFor`. */
export const levelOfKind: Record<CardKind, Level> = {
	event: 'big-picture',
	actor: 'big-picture',
	system: 'big-picture',
	hotspot: 'big-picture',
	opportunity: 'big-picture',
	command: 'process-modelling',
	policy: 'process-modelling',
	readmodel: 'process-modelling',
	aggregate: 'software-design',
	ui: 'software-design',
	context: 'big-picture',
};

/** Declaration order is the order the legend lists them, and the wall reads. */
export const CARD_KINDS: readonly CardKind[] = [
	'event',
	'actor',
	'system',
	'hotspot',
	'opportunity',
	'context',
	'command',
	'policy',
	'readmodel',
	'aggregate',
	'ui',
];

/**
 * The kinds available at a level: its own, and every shallower level's.
 *
 * Cumulative because the practice is. A process model still has domain events
 * and hotspots on it — it has *more* than a big picture, never different.
 */
export function kindsFor(level: Level): readonly CardKind[] {
	const depth = LEVELS.indexOf(level);
	return CARD_KINDS.filter((kind) => LEVELS.indexOf(levelOfKind[kind]) <= depth);
}

/**
 * The shallowest level that admits everything on this wall.
 *
 * What "can this storm be a big picture?" means. Used to refuse a level change
 * that would leave notes the notation no longer has a colour for, and to check a
 * file's declared level against what it actually contains.
 */
export function minimumLevel(document: { lanes: readonly LaneNode[] }): Level {
	let deepest = 0;
	for (const lane of document.lanes) {
		for (const card of lane.cards) {
			const depth = LEVELS.indexOf(levelOfKind[card.kind]);
			if (depth > deepest) deepest = depth;
		}
	}
	return LEVELS[deepest] ?? 'big-picture';
}

export const cardLabel: Record<CardKind, string> = {
	event: 'Domain event',
	actor: 'Actor',
	system: 'External system',
	hotspot: 'Hotspot',
	opportunity: 'Opportunity',
	command: 'Command',
	policy: 'Policy',
	readmodel: 'Read model',
	aggregate: 'Aggregate',
	ui: 'Screen',
	context: 'Bounded context',
};

/** Straight from the practice, and worth repeating on the board itself. */
export const cardMeaning: Record<CardKind, string> = {
	event: 'Something that happened, in the past tense and in the business’s words.',
	actor: 'A person or role who does something.',
	system: 'Something outside the boundary that events come from or go to.',
	hotspot: 'A problem or disagreement nobody in the room can settle.',
	opportunity: 'Something worth doing that the timeline has made visible.',
	command: 'A request to do something, in the imperative.',
	policy: 'The rule that reacts to an event: whenever this, do that.',
	readmodel: 'The information somebody needs in order to decide.',
	aggregate: 'The component that accepts commands and emits events.',
	ui: 'What a person looks at to decide, and acts through.',
	context: 'Where one model’s language stops and the next begins.',
};

/**
 * What a new note of each kind says before anybody writes on it.
 *
 * Here rather than in the reducer because two things need it and they must not
 * drift: the reducer titles a card with it, and the `+` palette shows it in the
 * preview that appears on hover. The preview is only honest if it is the same
 * string — a picture of a note you are not going to get is worse than no
 * picture.
 *
 * Written in the shape the kind wants: an event in the past tense, a command in
 * the imperative, a policy as "whenever this, do that". The placeholder is the
 * first thing anybody reads about a colour, so it teaches the grammar of the
 * card as well as naming it.
 */
export const newCardTitle: Record<CardKind, string> = {
	event: 'Something happened',
	actor: 'Somebody',
	system: 'Some system',
	hotspot: 'Something nobody agrees on',
	opportunity: 'Something worth doing',
	command: 'Do something',
	policy: 'Whenever this, do that',
	readmodel: 'Something somebody needs to see',
	aggregate: 'Some component',
	ui: 'Some screen',
	context: 'Some boundary',
};

/** The DSL keyword each kind is written with. One word, and the same word back. */
export const cardKeyword: Record<CardKind, string> = {
	event: 'event',
	actor: 'actor',
	system: 'system',
	hotspot: 'hotspot',
	opportunity: 'opportunity',
	command: 'command',
	policy: 'policy',
	readmodel: 'readmodel',
	aggregate: 'aggregate',
	ui: 'ui',
	context: 'context',
};

export function isCardKind(value: unknown): value is CardKind {
	return typeof value === 'string' && (CARD_KINDS as readonly string[]).includes(value);
}

/**
 * One sticky note, at one square of the board.
 *
 * A single node type for all five kinds rather than five interfaces, because on
 * a Big Picture wall they genuinely are the same thing: a coloured square with a
 * line of text on it, placed somewhere on a grid. What differs is what the
 * colour *means*, and meaning is not structure.
 */
export interface CardNode {
	readonly kind: CardKind;
	/** The words on the note. One line, in the room's own language. */
	readonly title: string;
	/**
	 * Which column of the timeline this note sits at. One-based; time runs left
	 * to right.
	 *
	 * **An explicit ordinal, which the phase-based draft of this model argued
	 * against.** That argument was right for a list and is wrong here. There, a
	 * card's position *was* its place in a list, so an index would have been a
	 * second copy of the same fact and the copy is what drifts. Here the board is
	 * two-dimensional and a column is a coordinate: it is the only record of when
	 * a note happens, and there is no list order for it to duplicate.
	 *
	 * It is also the only way to say the two things a wall says constantly and a
	 * list cannot. Two notes in different lanes at the same column are
	 * *simultaneous*. A lane with nothing at column 3 and something at column 4
	 * has a *gap*, which on a wall is a visible hole and in a list is
	 * unrepresentable.
	 *
	 * Several notes may share one column in one lane. That is the wall stacking
	 * them at one point in time, which is what happens when a moment turns out to
	 * involve an actor, a system and an event at once.
	 */
	readonly column: number;
	readonly notes: readonly string[];
}

/**
 * One horizontal swimlane: a row of the board, and the cards on it.
 *
 * A lane is a parallel track through the same timeline — a department, an actor,
 * a subsystem, whatever the room is separating. Lanes do not have their own
 * clocks: column 4 is the same moment in every lane, which is the whole reason
 * to draw them as rows rather than as separate walls.
 *
 * Declaration order is top-to-bottom order. *That* is still a list, so it still
 * has no index — see `CardNode.column` for why the horizontal axis is different.
 */
export interface LaneNode {
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
	/**
	 * Which of the three workshops this is, and therefore which colours the board
	 * offers.
	 *
	 * Stored rather than derived from what is on the wall, because it is a
	 * statement of intent: a session that has decided it is modelling a process
	 * has decided that before it has placed its first command. Deriving it would
	 * mean the level changed under the room the moment somebody added a card, and
	 * a facilitator could never set it up in advance.
	 *
	 * It is checked against the wall rather than ignored — a card whose kind the
	 * declared level does not admit is a parse error, and the board will not let
	 * the level be lowered past the notes already on it. So the two cannot
	 * disagree, and the one that is *declared* is the one that wins.
	 */
	readonly level: Level;
	readonly notes: readonly string[];
	/**
	 * The swimlanes, top to bottom.
	 *
	 * Always at least one, even on an empty board. The practice starts with paper
	 * on a wall, and the wall exists before anybody has written on it — so a fresh
	 * board is one unnamed lane holding no cards, which is what gives the first
	 * empty square somewhere to be.
	 */
	readonly lanes: readonly LaneNode[];
}

/** What an unnamed lane is called. A wall before anybody has divided it. */
export const UNNAMED_LANE = 'The wall';

export function emptyDocument(title = 'Untitled event storm'): EventStormDocument {
	// Big picture, because that is where the practice starts and where a board
	// opened by somebody who has not chosen yet should be.
	return { title, product: null, level: 'big-picture', notes: [], lanes: [emptyLane()] };
}

export function emptyLane(title = UNNAMED_LANE): LaneNode {
	return { title, notes: [], cards: [] };
}

/**
 * The rightmost column anything sits at, or 0 for a board with nothing on it.
 *
 * What "how wide is this storm" means, and the one number the board needs to
 * know how many columns to draw before adding its trailing empty one.
 */
export function lastColumn(document: { lanes: readonly LaneNode[] }): number {
	let last = 0;
	for (const lane of document.lanes) {
		for (const card of lane.cards) if (card.column > last) last = card.column;
	}
	return last;
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
