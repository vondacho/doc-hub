/**
 * The board model — an event storm as the UI needs it.
 *
 * Normalised, with generated ids, like doc-sm's and doc-em's.
 *
 * ## The board is a chessboard, and it is meant to feel endless
 *
 * Squares are addressed by (lane, column): the horizontal axis is time, the
 * vertical is parallel swimlanes, and a square may hold several notes stacked on
 * one point of one lane. Both axes are open — a lane can always be added below,
 * and there is always another column to the right.
 *
 * `cells` is sparse, which is what makes that affordable. An empty grid costs
 * nothing at all; only occupied squares are stored. The rendered width is
 * whatever is used plus one, so the surface always extends past the work on it
 * without ever being genuinely unbounded — see `columnCount`.
 *
 * Ids are in-memory only. They are never written to an `.eventstorm` file and
 * are regenerated on every import; nothing outside this tab refers to them.
 */

import { kindsFor, LEVELS, levelOfKind, tagKey, type CardKind, type Level } from '../eventstorm/model.ts';

export type { CardKind, Level };
export type Id = string;

export interface Card {
	readonly id: Id;
	/** Which of the five this note is. The colour, and what the colour means. */
	readonly kind: CardKind;
	readonly title: string;
	readonly notes: readonly string[];
	/**
	 * The note's free labels, in the order the file writes them.
	 *
	 * See `tagKey` in the document model for what a tag is, why the vocabulary
	 * is open, and why they are the one thing on this wall that is not coloured.
	 */
	readonly tags: readonly string[];
}

/**
 * `${laneId}|${column}` — one square of the board.
 *
 * doc-sm's shape, and for doc-sm's reason: the cell a card sits in *is* its
 * placement, and `cells` is the only place that fact is written down. A
 * `column` field on the card *and* a per-cell order array would be two
 * representations of one thing, and two representations are an invariant that
 * some reducer branch nobody re-read eventually violates. Deriving `@column` from
 * the key at export time means a corrupt export is not reachable rather than
 * merely unlikely.
 *
 * Ids never contain `|` — they are `l1`, `c4`.
 */
export type CellKey = string;

export function cellKey(laneId: Id, column: number): CellKey {
	return `${laneId}|${column}`;
}

export function splitCellKey(key: CellKey): { laneId: Id; column: number } {
	const separator = key.indexOf('|');
	return { laneId: key.slice(0, separator), column: Number(key.slice(separator + 1)) };
}

/** One horizontal swimlane. Its cards live in `cells`, not on it. */
export interface Lane {
	readonly id: Id;
	readonly title: string;
	readonly notes: readonly string[];
}

export interface BoardState {
	readonly title: string;
	/** The registered product's shortname, or null for a storm about no product. */
	readonly product: string | null;
	readonly notes: readonly string[];
	/** Top to bottom. Order is the only statement of which lane is where. */
	readonly laneOrder: readonly Id[];
	readonly lanes: Readonly<Record<Id, Lane>>;
	readonly cards: Readonly<Record<Id, Card>>;
	/**
	 * Which cards sit on which square, in stacking order.
	 *
	 * Sparse: a missing key is an empty square, and squares are not
	 * pre-created. That is what makes the board affordably infinite — an empty
	 * grid costs nothing, and a wall with forty notes on it costs forty entries
	 * rather than lanes × columns of them.
	 */
	readonly cells: Readonly<Record<CellKey, readonly Id[]>>;
}

export function emptyBoard(title = 'Untitled event storm'): BoardState {
	return { title, product: null, notes: [], laneOrder: [], lanes: {}, cards: {}, cells: {} };
}

/** The cards stacked on one square, in the order they were placed. */
export function cardsAt(board: BoardState, laneId: Id, column: number): readonly Id[] {
	return board.cells[cellKey(laneId, column)] ?? [];
}

/**
 * The rightmost column anything sits at, or 0 for a board with nothing on it.
 *
 * What "how wide is this storm" means. The grid draws one column past it — see
 * `columnCount` — so there is always an empty square at the end to place the
 * next note on.
 */
export function lastColumn(board: BoardState): number {
	let last = 0;
	for (const key of Object.keys(board.cells)) {
		if ((board.cells[key] ?? []).length === 0) continue;
		const { column } = splitCellKey(key);
		if (column > last) last = column;
	}
	return last;
}

/**
 * How many columns to draw: everything used, plus one empty one at the end.
 *
 * The board is infinite in the sense that matters — there is always another
 * square to the right, and reaching it creates the one after. Rendering it
 * genuinely unbounded would mean a virtualised grid, which is a great deal of
 * machinery for a wall that in practice runs to a few dozen columns.
 *
 * A minimum of eight so a fresh board looks like a board rather than like one
 * lonely square, and so the chessboard reads as a surface you place things on.
 */
export const MIN_COLUMNS = 8;

export function columnCount(board: BoardState): number {
	return Math.max(MIN_COLUMNS, lastColumn(board) + 1);
}

/** The lane a card sits in, or undefined when the board has lost it. */
export function cellOfCard(board: BoardState, cardId: Id): CellKey | undefined {
	for (const [key, ids] of Object.entries(board.cells)) {
		if (ids.includes(cardId)) return key;
	}
	return undefined;
}

/**
 * Every card that has a note.
 *
 * Not "every card": a card with no notes has no caret and nothing to reveal, so
 * counting it would make the global toggle claim to have expanded something it
 * did not.
 */
/** One tag as the filter row offers it: how it is spelled, and how many wear it. */
export interface TagInUse {
	/** The first spelling seen, reading lanes and then cards in order. */
	readonly tag: string;
	/** What `tagKey` folds it to. The identity the filter actually matches on. */
	readonly key: string;
	readonly count: number;
}

/**
 * Every tag on the wall, most-used first, with how many notes wear each.
 *
 * ## Folded by key, labelled by first spelling
 *
 * The parser refuses one note tagged `+Legal +legal`, but nothing stops *two*
 * notes spelling the same label differently — the check is per card, because
 * that is the scope in which a repeat means a bad merge. Here the two are one
 * tag with a count of two, since a filter that offered both would defeat the
 * only thing a tag is for.
 *
 * The label shown is the first spelling encountered. Not the commonest, which
 * would be more democratic and would also make the chip rename itself as notes
 * are added — a control whose text moves under the reader is worse than one
 * that picked a spelling and kept it.
 *
 * ## Sorted by count, then alphabetically
 *
 * A wall's useful tags are the ones on several notes, and they should be
 * reachable without reading the row. Ties break alphabetically so the order is
 * total: sorting by count alone would leave every single-use tag free to swap
 * places on each keystroke in the source pane, which reparses the whole board.
 */
export function tagsInUse(board: BoardState): readonly TagInUse[] {
	const found = new Map<string, { tag: string; count: number }>();

	for (const card of Object.values(board.cards)) {
		for (const tag of card.tags) {
			const key = tagKey(tag);
			const seen = found.get(key);
			if (seen === undefined) found.set(key, { tag, count: 1 });
			else seen.count += 1;
		}
	}

	return [...found.entries()]
		.map(([key, { tag, count }]) => ({ tag, key, count }))
		.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/**
 * Which notes the wall is pointing at, or `null` when nothing is filtering it.
 *
 * `null` rather than "every id", because the two mean different things to the
 * caller: no filter is not the same as a filter that happens to match
 * everything, and only the first should leave the wall undimmed.
 *
 * ## Two filters, one answer
 *
 * The tag row is one, and the level picker is the other — a board set to big
 * picture dims the commands and policies on it rather than refusing to be set
 * there, argued beside `Level` in the document model. They are computed
 * together and returned as one set because the wall has one dimming: a note
 * either reads or recedes, and asking a reader to tell two strengths of grey
 * apart would be inventing a third state nobody asked for.
 *
 * The two combine as **and** — a note reads only if it survives both — while
 * the tags within the row combine as **or**. That is not an inconsistency, it
 * is the difference between the two questions. The tags are a query somebody
 * types: "where is the payments work, and the legal work", so union, because
 * narrowing to notes wearing both is the rarer want and the one that silently
 * answers "nowhere" and looks broken. The level is the workshop being run, and
 * a card outside it is outside it however it is tagged.
 *
 * `level` is a parameter and not a field on the board, because it is not a fact
 * about the storm — it is which of it this visitor is looking at. See `Level` in
 * the document model for why that stopped being written into the file.
 */
export function filtered(board: BoardState, keys: ReadonlySet<string>, level: Level): ReadonlySet<Id> | null {
	const shown = new Set(kindsFor(level));
	const byLevel = Object.values(board.cards).some((card) => !shown.has(card.kind));
	if (keys.size === 0 && !byLevel) return null;

	const matching = new Set<Id>();
	for (const [id, card] of Object.entries(board.cards)) {
		if (!shown.has(card.kind)) continue;
		if (keys.size > 0 && !card.tags.some((tag) => keys.has(tagKey(tag)))) continue;
		matching.add(id);
	}
	return matching;
}

/**
 * The notes the level is dimming: everything of a kind it does not offer.
 *
 * What the picker needs in order to say how much of the wall the lens is
 * holding back. The board never uses it to refuse anything — see `Level`.
 */
export function outsideLevel(board: BoardState, level: Level): readonly Card[] {
	const shown = new Set(kindsFor(level));
	return Object.values(board.cards).filter((card) => !shown.has(card.kind));
}

/**
 * The shallowest level that dims nothing — how far this wall actually reaches.
 *
 * The way back from a lens, and the only number that answers "where is the rest
 * of it?" in one word. `big-picture` for an empty board, and for one that never
 * went deeper: a storm with no commands on it is already whole at every level,
 * which is why the picker says nothing at all in that case.
 */
export function deepestLevel(board: BoardState): Level {
	let deepest = 0;
	for (const card of Object.values(board.cards)) {
		const depth = LEVELS.indexOf(levelOfKind[card.kind]);
		if (depth > deepest) deepest = depth;
	}
	return LEVELS[deepest] ?? 'big-picture';
}

export function cardsWithDetail(board: BoardState): readonly Id[] {
	const found: Id[] = [];
	for (const [id, lane] of Object.entries(board.lanes)) if (lane.notes.length > 0) found.push(id);
	for (const [id, card] of Object.entries(board.cards)) if (card.notes.length > 0) found.push(id);
	return found;
}
