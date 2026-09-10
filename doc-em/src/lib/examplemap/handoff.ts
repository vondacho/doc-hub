/**
 * Arriving from the story map, with a story to refine.
 *
 * doc-sm picks which story a session is about; this board is where that story is
 * broken into rules and examples. The two are separate applications with
 * separate origins, so the handover is a **link**: doc-sm opens
 * `<doc-em>/?story=…` and everything the session needs to start is in the query
 * string.
 *
 * ## Why a query string and not a shared store
 *
 * Neither board stores anything on a server, and `localStorage` is per-origin —
 * `doc-sm.localhost` cannot read `doc-em.localhost`'s entries, and nothing about
 * that is worth working around. A URL is the one channel two origins already
 * share, it survives being bookmarked and pasted into a chat, and it keeps the
 * promise both boards make: the map is yours, and it never leaves your browser.
 *
 * ## What the link decides, and what it does not
 *
 * The title is the whole of the addressing. `storageKey(product, title)` is what
 * doc-em already names a saved board with, so the same story arriving twice
 * resolves to the same entry — the second visit **reopens the map from the
 * first**, questions, rules and all. That is the point: a refinement session is
 * rarely finished in one sitting.
 *
 * When nothing is stored under that key, the rest of the parameters seed a new
 * map: the story card with its need, its ticket and its tags, and nothing else.
 * No rules and no examples — those are what the session is for, and a board that
 * arrived with them would be answering the question it was called to ask.
 *
 * Every parameter but `story` is optional, and an unreadable one is dropped
 * rather than refused. A link somebody edited by hand should open a board, not
 * an error page.
 */

import { quote, quoteIfNeeded } from '../board/source.ts';
import { DEFAULT_STORY_STATUS, isStoryStatus, type StoryStatus } from './model.ts';

/** The names doc-sm writes and this module reads. One list, stated once. */
export const PARAMS = {
	title: 'story',
	product: 'product',
	space: 'space',
	ticket: 'ticket',
	status: 'status',
	persona: 'as',
	want: 'want',
	soThat: 'so',
	/** Repeatable: `&tag=payments&tag=legal`. */
	tag: 'tag',
} as const;

/**
 * A story handed over, in the shape the seed is written from.
 *
 * Deliberately the story map's vocabulary rather than this board's: it is what
 * arrived, and turning it into a map is the next function's job.
 */
export interface Handoff {
	readonly title: string;
	readonly product: string | null;
	readonly space: string | null;
	readonly ticket: string | null;
	readonly status: StoryStatus;
	readonly persona: string | null;
	readonly want: string | null;
	readonly soThat: string | null;
	readonly tags: readonly string[];
}

/**
 * One line's worth of a value somebody put in a URL.
 *
 * Whitespace is collapsed and the result is capped, for two different reasons.
 * The format writes a title on one line, and `quote()` does not escape a
 * newline — a pasted paragraph would produce a file this board cannot parse.
 * And a title is a name: one long enough to fill the screen is not a name, and
 * it would be truncated by `storageKey` anyway.
 */
function clean(value: string | null, limit = 200): string | null {
	if (value === null) return null;
	const text = value.replace(/\s+/g, ' ').trim().slice(0, limit);
	return text === '' ? null : text;
}

/**
 * What the query string is asking for, or `null` when it is asking for nothing.
 *
 * `null` is the ordinary case — somebody opened the board directly — and the
 * caller reads it as "carry on as usual", which means reopening whatever this
 * browser had open last.
 */
export function readHandoff(search: string): Handoff | null {
	const params = new URLSearchParams(search);
	const title = clean(params.get(PARAMS.title));
	if (title === null) return null;

	const status = params.get(PARAMS.status);
	return {
		title,
		product: clean(params.get(PARAMS.product), 80),
		space: clean(params.get(PARAMS.space), 40),
		ticket: clean(params.get(PARAMS.ticket), 60),
		// An unknown status is dropped rather than carried: this board's six are
		// doc-sm's six, so anything else came from a hand-edited link.
		status: status !== null && isStoryStatus(status) ? status : DEFAULT_STORY_STATUS,
		persona: clean(params.get(PARAMS.persona)),
		want: clean(params.get(PARAMS.want), 400),
		soThat: clean(params.get(PARAMS.soThat), 400),
		tags: params
			.getAll(PARAMS.tag)
			.map((tag) => clean(tag, 60))
			.filter((tag): tag is string => tag !== null)
			.slice(0, 12),
	};
}

/**
 * The map a handed-over story starts as, as text.
 *
 * Text rather than a document, because the text *is* the document here — the
 * board parses what it is given and everything on screen is derived from it. It
 * is written the way `edit.ts` writes: two-space indentation, quoted strings,
 * annotations in the order the format page shows them.
 *
 * The map takes the story's own title. That is what makes the second visit find
 * the first one's work: `storageKey` is built from the product and the map
 * title, and doc-sm computes the same pair when it writes the link.
 *
 * A clause nobody sent is left out entirely rather than written empty. `as ""`
 * is a persona of no one, and the board renders a blank line for it; a missing
 * clause is simply a question the session has not answered yet, which is the
 * honest state for a story arriving from a map.
 */
export function handoffSource(handoff: Handoff): string {
	const head: string[] = [];
	if (handoff.product !== null) head.push(`  product ${quote(handoff.product)}`);
	if (handoff.space !== null) head.push(`  space ${quote(handoff.space)}`);

	const annotations: string[] = [];
	if (handoff.ticket !== null) annotations.push(`#${quoteIfNeeded(handoff.ticket)}`);
	// Written even when it is the default, because it came from the tracker on
	// the other side: a story that is `~analysing` over there should not read
	// Open here on the grounds that Open is what an unstated status means.
	annotations.push(`~${handoff.status}`);
	for (const tag of handoff.tags) annotations.push(`+${quoteIfNeeded(tag)}`);

	const need: string[] = [];
	if (handoff.persona !== null) need.push(`    as ${quote(handoff.persona)}`);
	if (handoff.want !== null) need.push(`    want ${quote(handoff.want)}`);
	if (handoff.soThat !== null) need.push(`    so ${quote(handoff.soThat)}`);

	const story =
		need.length === 0
			? `  story ${quote(handoff.title)} ${annotations.join(' ')}`
			: [`  story ${quote(handoff.title)} ${annotations.join(' ')} {`, ...need, '  }'].join('\n');

	return [`examplemap ${quote(handoff.title)} {`, ...head, story, '}', ''].join('\n');
}
