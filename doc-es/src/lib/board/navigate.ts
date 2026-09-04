/**
 * Moving about the wall with the arrow keys: where the cursor goes, and where a
 * note goes when it is carried.
 *
 * Pure, like `state.ts` beside it and for the same reason — these are questions
 * about a board, not gestures against one. `BoardGrid` asks them and turns the
 * answers into a focus call or a `moveCard`; nothing here knows about the DOM
 * or about dispatch.
 *
 * ## The cursor walks notes, not squares
 *
 * An arrow moves to the next *note* in that direction, skipping however many
 * empty squares lie between. The alternative — stepping square by square — was
 * tempting because an empty square on this wall means something (see
 * `CardNode.column`), and it is wrong for a cursor: a lane with notes at
 * columns 1 and 9 would take eight presses to cross, and the seven stops in
 * between offer nothing to do. The gap is a fact worth *seeing*, which the wall
 * already shows; it is not a place worth *standing*.
 *
 * ## Up and down walk the stack before they leave the lane
 *
 * A square may hold several notes — a moment that turned out to involve an
 * actor, a system and an event at once — and they are drawn as a column within
 * the square. So down goes to the next note in the stack, and only steps to the
 * lane below once it runs out. Anything else would make notes reachable by
 * pointer and not by keyboard, which is the failure this whole file exists to
 * prevent.
 *
 * Leaving a lane, the cursor scans on for the next lane with something *at that
 * same column*. Vertical movement is movement through one moment in time, and a
 * down-arrow that slid to a different column to find an occupant would lose the
 * one thing the vertical axis means.
 *
 * ## Straight first, then diagonally
 *
 * Each direction has a *direct* neighbour rule — the same lane for left and
 * right, the same column for up and down — and it is tried first, because it is
 * the one that means something. Left and right walk a lane because a lane is a
 * story; up and down hold a column because a column is a moment.
 *
 * But a wall whose lanes do not line up would strand the cursor on that rule
 * alone. Nothing below at column 4 is the ordinary state of a storm: lanes are
 * busy at different times, which is half of what the picture is *for*. A
 * down-arrow that did nothing there would be telling the truth about column 4
 * and lying about the wall, which plainly has more notes below.
 *
 * So when the direct rule finds nothing, the cursor takes the nearest note in
 * that half of the wall instead — nearest by the axis pressed first, then by
 * how far it sits off to the side, then leftmost and topmost to break a tie so
 * the answer is never arbitrary. The two rules cannot fight over the same note:
 * the diagonal search only ever looks at lanes the vertical rule has already
 * ruled out, and at columns the horizontal one has.
 *
 * ## It moves the cursor and nothing else
 *
 * There was a `step` here once, for shift-arrow to carry a note the way the
 * cursor would have gone, and it went because the board already had that
 * gesture: Space lifts a note and the arrows aim it. Two ways to move a note by
 * keyboard is not twice as good — it is one more thing to know, and the one
 * that reads better in a help line is not always the one the hands reach for.
 * A cursor that only ever moves a cursor is also a cursor nobody has to be
 * careful with.
 */

import { cardsAt, cellOfCard, lastColumn, splitCellKey, type BoardState, type Id } from './state.ts';

export type Direction = 'up' | 'down' | 'left' | 'right';

/** The arrow keys, by `KeyboardEvent.key`. Anything else is not a direction. */
export const DIRECTIONS: Readonly<Record<string, Direction>> = {
	ArrowUp: 'up',
	ArrowDown: 'down',
	ArrowLeft: 'left',
	ArrowRight: 'right',
};

/** Everything a move needs to know about where a note currently is. */
interface Where {
	readonly laneId: Id;
	readonly column: number;
	/** The lane's position in `laneOrder`, which is the vertical axis. */
	readonly lane: number;
	readonly stack: readonly Id[];
	/** How deep in that square's stack the note sits. */
	readonly index: number;
}

function whereIs(board: BoardState, cardId: Id): Where | null {
	const key = cellOfCard(board, cardId);
	if (key === undefined) return null;

	const { laneId, column } = splitCellKey(key);
	const lane = board.laneOrder.indexOf(laneId);
	if (lane < 0) return null;

	const stack = cardsAt(board, laneId, column);
	const index = stack.indexOf(cardId);
	if (index < 0) return null;

	return { laneId, column, lane, stack, index };
}

/**
 * The note an arrow key moves the cursor to, or `null` at the edge of the wall.
 *
 * `null` rather than wrapping round. A wall is a picture with a shape, and a
 * cursor that reappeared at the far end would be claiming the last column and
 * the first are neighbours — which is the one thing a timeline says they are
 * not.
 */
export function neighbour(board: BoardState, cardId: Id, direction: Direction): Id | null {
	const at = whereIs(board, cardId);
	if (at === null) return null;

	if (direction === 'left' || direction === 'right') {
		const by = direction === 'right' ? 1 : -1;
		const last = lastColumn(board);
		for (let column = at.column + by; column >= 1 && column <= last; column += by) {
			const stack = cardsAt(board, at.laneId, column);
			if (stack.length > 0) return enter(stack, at, direction);
		}
		return diagonal(board, at, direction);
	}

	const within = at.index + (direction === 'down' ? 1 : -1);
	if (within >= 0 && within < at.stack.length) return at.stack[within] ?? null;

	const by = direction === 'down' ? 1 : -1;
	for (let lane = at.lane + by; lane >= 0 && lane < board.laneOrder.length; lane += by) {
		const laneId = board.laneOrder[lane];
		if (laneId === undefined) continue;
		const stack = cardsAt(board, laneId, at.column);
		if (stack.length > 0) return enter(stack, at, direction);
	}
	return diagonal(board, at, direction);
}

/**
 * Which note of a square the cursor lands on, having arrived from `at`.
 *
 * Vertically it enters from the side it came in on — down lands on the top
 * note, up on the bottom — so a walk through stacked squares is continuous
 * rather than jumping to the far end of each.
 *
 * Horizontally it keeps its depth where the square is deep enough, so a row of
 * stacked squares can be read straight across at the level you were reading.
 */
function enter(stack: readonly Id[], at: Where, direction: Direction): Id | null {
	if (direction === 'down') return stack[0] ?? null;
	if (direction === 'up') return stack[stack.length - 1] ?? null;
	return stack[Math.min(at.index, stack.length - 1)] ?? null;
}

/**
 * The nearest note in that half of the wall, when the direct rule found none.
 *
 * Ranked on three keys, in order: how far along the axis that was pressed, then
 * how far off to the side, then the side coordinate itself. The first is what
 * makes it feel like the direction asked for; the second is what makes it feel
 * like the *nearest* note rather than any note; the third only ever decides
 * between two notes equally far away on both counts, and picks the earlier
 * column or the higher lane so that the same press always goes the same way.
 *
 * Squares are ranked rather than notes, so which note of a stack is landed on
 * stays `enter`'s single answer to that question.
 */
function diagonal(board: BoardState, at: Where, direction: Direction): Id | null {
	const vertical = direction === 'up' || direction === 'down';
	const forward = direction === 'down' || direction === 'right';

	let best: { rank: readonly [number, number, number]; stack: readonly Id[] } | null = null;

	for (const [key, stack] of Object.entries(board.cells)) {
		if (stack.length === 0) continue;
		const { laneId, column } = splitCellKey(key);
		const lane = board.laneOrder.indexOf(laneId);
		if (lane < 0) continue;

		// Strictly in the direction pressed. Same lane is left and right's
		// business; same column is up and down's.
		const along = vertical ? lane - at.lane : column - at.column;
		const ahead = forward ? along : -along;
		if (ahead <= 0) continue;

		const aside = vertical ? column : lane;
		const rank = [ahead, Math.abs(aside - (vertical ? at.column : at.lane)), aside] as const;
		if (best === null || nearer(rank, best.rank)) best = { rank, stack };
	}

	return best === null ? null : enter(best.stack, at, direction);
}

/**
 * Key-by-key comparison of two ranks.
 *
 * Spelled out rather than `a < b` on the tuples, which is the shape this wants
 * and quietly the wrong answer: relational operators on arrays compare them as
 * *strings*, so a wall that ever grew to ten lanes would find `[10]` sorting
 * before `[9]` and the cursor would start preferring the far side of the board.
 */
function nearer(a: readonly [number, number, number], b: readonly [number, number, number]): boolean {
	for (let key = 0; key < a.length; key += 1) {
		const left = a[key] ?? 0;
		const right = b[key] ?? 0;
		if (left !== right) return left < right;
	}
	return false;
}
