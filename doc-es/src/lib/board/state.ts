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

import { type CardKind, type Level } from '../eventstorm/model.ts';

export type { CardKind, Level };
export type Id = string;

export interface Card {
	readonly id: Id;
	/** Which of the five this note is. The colour, and what the colour means. */
	readonly kind: CardKind;
	readonly title: string;
	readonly notes: readonly string[];
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
	/** Which workshop this is, and therefore which colours the board offers. */
	readonly level: Level;
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
	return { title, product: null, level: 'big-picture', notes: [], laneOrder: [], lanes: {}, cards: {}, cells: {} };
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
export function cardsWithDetail(board: BoardState): readonly Id[] {
	const found: Id[] = [];
	for (const [id, lane] of Object.entries(board.lanes)) if (lane.notes.length > 0) found.push(id);
	for (const [id, card] of Object.entries(board.cards)) if (card.notes.length > 0) found.push(id);
	return found;
}
