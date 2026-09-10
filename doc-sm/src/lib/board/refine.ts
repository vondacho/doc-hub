/**
 * Handing a story to doc-em, to be refined.
 *
 * A story map says what the product does and in what order; an example map takes
 * one story and asks, for twenty-five minutes, what the rules under it are. They
 * are the two halves of the same conversation and they are two applications, so
 * the join between them is a **link**.
 *
 * Everything the session needs to start goes in the query string: the story's
 * title, the product it belongs to, its need, its ticket and its tags. doc-em
 * reads them in src/lib/examplemap/handoff.ts, and that file — not this one — is
 * where the contract is written up, because the reader is the side that has to
 * cope with a link somebody edited by hand.
 *
 * ## The title is the address
 *
 * doc-em names a saved board by its product and title, exactly as this board
 * does. So the same story linked twice lands on the same entry: the first visit
 * starts a map, the second reopens it with everything the room wrote on it. That
 * is why the title is sent even though doc-em could have been handed an opaque
 * id — an id would have been unique and useless, and two boards that name a
 * board the same way can find each other without either one storing anything.
 *
 * Nothing is sent to a server on the way. The link is resolved by the visitor's
 * browser, doc-em keeps the map in *their* browser, and neither board's promise
 * about where a map lives changes because they now link to each other.
 */

import type { BoardState, Story } from './state.ts';

/** The names doc-em reads. Mirrored in its src/lib/examplemap/handoff.ts. */
const PARAMS = {
	title: 'story',
	product: 'product',
	space: 'space',
	ticket: 'ticket',
	status: 'status',
	persona: 'as',
	want: 'want',
	soThat: 'so',
	tag: 'tag',
} as const;

/**
 * Where this story is refined, or `null` when it cannot be said yet.
 *
 * Null in two cases, and the menu says which. An unnamed story has no address —
 * the title is what doc-em resolves a board by, so linking one would open a map
 * that the next visit could never find again. And an `EXAMPLE_MAPPER_URL` that
 * is not a URL is a deployment fault: better a control that explains itself than
 * a link to `undefined/?story=…`.
 *
 * The path is deliberately dropped and rebuilt as `/`: the configured value
 * names the board's origin, and appending a query to whatever path it happened
 * to carry would be a different guess every time somebody set it with a slash.
 */
export function refineUrl(exampleMapper: string, board: BoardState, story: Story): string | null {
	const title = story.title.trim();
	if (title === '') return null;

	let url: URL;
	try {
		url = new URL('/', exampleMapper);
	} catch {
		return null;
	}

	const set = (name: string, value: string | null) => {
		const text = value === null ? '' : value.trim();
		if (text !== '') url.searchParams.set(name, text);
	};

	set(PARAMS.title, title);
	// The product and the space belong to the map rather than to the card, and
	// they travel because they are what the story is *about*: a ticket raised
	// from the example map has to land in the same place one raised from here
	// would. The product also completes doc-em's storage key, so a story called
	// "Sign in" under two products stays two boards.
	set(PARAMS.product, board.product);
	set(PARAMS.space, board.space);
	set(PARAMS.ticket, story.ticket);
	set(PARAMS.status, story.status);
	set(PARAMS.persona, story.persona);
	set(PARAMS.want, story.want);
	set(PARAMS.soThat, story.soThat);
	// Repeated rather than joined, so a tag with a comma in it is still one tag.
	for (const tag of story.tags) {
		const text = tag.trim();
		if (text !== '') url.searchParams.append(PARAMS.tag, text);
	}

	return url.toString();
}
