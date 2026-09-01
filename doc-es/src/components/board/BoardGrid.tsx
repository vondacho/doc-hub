/**
 * The board: a chessboard of squares, lanes down the side and time across.
 *
 * The two axes mean different things, and that is the whole layout.
 *
 * **Horizontal is time.** Column 4 is the same moment in every lane, which is
 * the one thing this arrangement says that a list of events cannot: two notes
 * side by side are simultaneous, and a lane that is empty where its neighbour is
 * busy has a visible hole in it.
 *
 * **Vertical is parallel tracks**, plus depth. A lane is a department, an actor,
 * a subsystem — whatever the room is separating — and within one square the
 * notes stack, because a moment often turns out to involve an actor, a system
 * and an event at once.
 *
 * Square cards, on a squared surface. This is the one board of the three that
 * does not read as columns of text: a wall of sticky notes is a grid of roughly
 * equal squares, and making the cards any other shape would make the arrangement
 * stop looking like the thing it is a picture of. The text inside is small and
 * clamped for the same reason — a note that grew to fit its words would push its
 * neighbours out of alignment and the grid would stop being a grid.
 *
 * ## Endless in the direction that matters
 *
 * There is always one empty column past the rightmost note, and a control to add
 * a lane under the last one. Reaching the end creates the next square, so the
 * surface never runs out from under the workshop.
 *
 * It is not literally unbounded: the grid renders `columnCount` columns, which is
 * whatever is used plus one, with a floor so a fresh board looks like a board.
 * Genuine infinity would mean a virtualised grid, which is a great deal of
 * machinery for a wall that in practice runs to a few dozen columns — and it
 * would cost the thing that makes this readable, which is that the whole storm
 * is on screen at once at the far zoom stops.
 */

import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDroppable } from '@dnd-kit/core';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cardLabel, cardMeaning, kindsFor, type CardKind } from '../../lib/eventstorm/model.ts';
import { cardClass } from '../../lib/board/kinds.ts';
import type { BoardAction } from '../../lib/board/gestures.ts';
import { cardsAt, cellKey, columnCount, type BoardState, type Id } from '../../lib/board/state.ts';
import { CardMenu, type CardMenuAction } from './CardMenu.tsx';
import { EDGE, GAP, KindPalette } from './KindPalette.tsx';
import { Icon } from './Icon.tsx';

/** One square, in `em`, so a single font-size scales the whole board. */
const SQUARE = '7.5em';
/** The lane rail down the left. Wide enough for a name and its controls. */
const RAIL = '9em';

/**
 * Font-size at 100%, in px. Everything on the board is `em` against this.
 *
 * 25.6 rather than 16, which is 16 × 1.6: what used to be the *top* zoom stop is
 * now the bottom one. The squares were too small to read a four-word note in at
 * the old 100%, so nobody ever worked at it — the stops below what this board
 * needs are stops nobody visits, and a zoom range whose first half is unusable
 * is really a shorter range that starts in the wrong place.
 *
 * The stops themselves are unchanged at 100–160% (see `ZOOM_STOPS` in
 * EventStormBoard). Moving the base rather than the multipliers keeps the
 * percentages the toolbar shows meaning what they say — 100% is this board's
 * natural size, whatever that happens to be in pixels — and it is one number
 * rather than five.
 *
 * Larger than doc-sm's and doc-em's 20.8 because this board's cards are squares
 * with clamped text rather than columns that grow to fit. A square has to be big
 * enough to read at rest; a column can be narrow and still legible.
 */
export const BASE_FONT = 25.6;

/** Row 1 is the column ruler; lanes start under it. */
const RULER_ROW = 1;
const FIRST_LANE_ROW = 2;

export function BoardGrid({
	board,
	dispatch,
	zoom,
	fullscreen,
	documentKey,
	expanded,
	onToggleDetail,
	selected,
	onSelect,
}: {
	board: BoardState;
	dispatch: (action: BoardAction) => void;
	zoom: number;
	fullscreen: boolean;
	/** Changes on every import, so the scroller can go back to the start. */
	documentKey: number;
	expanded: ReadonlySet<Id>;
	onToggleDetail: (id: Id) => void;
	/** The card whose text the source pane is emphasising, if any. */
	selected: { kind: 'lane' | 'card'; id: Id } | null;
	onSelect: (pick: { kind: 'lane' | 'card'; id: Id }) => void;
}) {
	const scroller = useRef<HTMLDivElement>(null);

	useLayoutEffect(() => {
		scroller.current?.scrollTo({ left: 0, top: 0 });
	}, [documentKey]);

	const columns = columnCount(board);

	return (
		/*
		 * The grid fills the height it is given and scrolls inside it — in both
		 * states, which is what changed when the board grew a frame.
		 *
		 * It used to size itself: `max-height: 75vh` outside fullscreen, and no
		 * part in any flex height chain. That worked while the page scrolled and
		 * the board was simply a tall block on it. Inside a frame of a fixed
		 * height it does not: 75vh plus a toolbar plus a legend is taller than the
		 * frame, so the grid ran out of the bottom of it and over the footer.
		 *
		 * `fullscreen` was standing in for "am I in a frame?" all along. The answer
		 * is now always yes, so only the padding and the corner still differ.
		 */
		<div
			className={`relative flex min-h-0 min-w-0 flex-1 flex-col border border-slate-200 bg-white dark:border-slate-700 dark:bg-night-raised ${
				fullscreen ? 'rounded-xl p-4' : 'rounded-2xl p-3'
			}`}
		>
			<div
				ref={scroller}
				className="board-scroll min-h-0 flex-1"
				style={{ maxHeight: '100%', fontSize: `${BASE_FONT * zoom}px` }}
			>
				<div
					className="grid min-w-max gap-[0.25em]"
					style={{ gridTemplateColumns: `${RAIL} repeat(${columns}, ${SQUARE})` }}
				>
					{/* Opaque behind the ruler and behind the rail, so squares scroll
					    under both rather than through them. The rail is the lower of
					    the two so the corner belongs to the ruler. */}
					<div
						aria-hidden="true"
						style={{ gridColumn: '1 / -1', gridRow: RULER_ROW }}
						className="sticky top-0 z-[5] -mb-[0.15em] bg-white pb-[0.15em] dark:bg-night-raised"
					/>
					<div
						aria-hidden="true"
						style={{ gridColumn: 1, gridRow: `1 / ${FIRST_LANE_ROW + board.laneOrder.length + 1}` }}
						className="sticky left-0 z-[3] -mr-[0.15em] bg-white pr-[0.15em] dark:bg-night-raised"
					/>

					{/* The corner. Sticks both ways, so it outranks both. */}
					<div
						style={{ gridColumn: 1, gridRow: RULER_ROW }}
						className="sticky top-0 left-0 z-30 flex items-end px-[0.4em] pb-[0.2em] text-[0.62em] font-semibold tracking-[0.14em] text-ink-muted uppercase dark:text-slate-400"
					>
						Lanes
					</div>

					{/*
					 * The column ruler.
					 *
					 * Numbers rather than nothing, because a column is a coordinate the
					 * file writes down — `@5` in the text is this 5 on the board — and
					 * without them the two are impossible to line up by eye when
					 * hand-editing.
					 */}
					{Array.from({ length: columns }, (_, i) => (
						<div
							key={`ruler-${i}`}
							style={{ gridColumn: i + 2, gridRow: RULER_ROW }}
							className="sticky top-0 z-10 flex items-end justify-center pb-[0.2em] text-[0.62em] tabular-nums text-ink-muted dark:text-slate-400"
						>
							{i + 1}
						</div>
					))}

					<SortableContext items={[...board.laneOrder]} strategy={verticalListSortingStrategy}>
						{board.laneOrder.map((laneId, index) => (
							<LaneLabel
								key={laneId}
								board={board}
								dispatch={dispatch}
								laneId={laneId}
								index={index}
								row={FIRST_LANE_ROW + index}
								expanded={expanded}
								onToggleDetail={onToggleDetail}
								selected={selected?.kind === 'lane' && selected.id === laneId}
								onSelect={() => onSelect({ kind: 'lane', id: laneId })}
							/>
						))}
					</SortableContext>

					{board.laneOrder.flatMap((laneId, index) =>
						Array.from({ length: columns }, (_, i) => (
							<Square
								key={`${laneId}-${i + 1}`}
								board={board}
								dispatch={dispatch}
								laneId={laneId}
								column={i + 1}
								row={FIRST_LANE_ROW + index}
								expanded={expanded}
								onToggleDetail={onToggleDetail}
								selected={selected}
								onSelect={onSelect}
							/>
						)),
					)}

					{/* One more lane, always available under the last. The vertical axis
					    is as open as the horizontal one, and this is its empty column. */}
					<button
						type="button"
						onClick={() => dispatch({ type: 'addLane', index: board.laneOrder.length })}
						aria-label="Add a lane"
						style={{ gridColumn: 1, gridRow: FIRST_LANE_ROW + board.laneOrder.length }}
						className="sticky left-0 z-[4] my-[0.15em] flex items-center justify-center gap-[0.3em] rounded-[0.3em] border border-dashed border-slate-300 py-[0.4em] text-[0.7em] text-ink-muted transition hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none dark:border-slate-600 dark:text-slate-400 dark:hover:border-sky-400 dark:hover:text-sky-400"
					>
						<Icon name="plus" className="h-[1em] w-[1em]" />
						Lane
					</button>
				</div>
			</div>
		</div>
	);
}

/**
 * A lane's label in the left rail: its name, its notes, and its moves.
 *
 * Not a sticky note — a lane is a line somebody drew on the wall, not something
 * written on one — so it is plain rather than tinted, exactly as doc-sm's band
 * labels are.
 */
function LaneLabel({
	board,
	dispatch,
	laneId,
	index,
	row,
	expanded,
	onToggleDetail,
	selected,
	onSelect,
}: {
	board: BoardState;
	dispatch: (action: BoardAction) => void;
	laneId: Id;
	index: number;
	row: number;
	expanded: ReadonlySet<Id>;
	onToggleDetail: (id: Id) => void;
	selected: boolean;
	onSelect: () => void;
}) {
	const lane = board.lanes[laneId];
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: laneId,
		data: { type: 'lane' },
	});
	const [editing, setEditing] = useState(false);
	const input = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (editing) {
			input.current?.focus();
			input.current?.select();
		}
	}, [editing]);

	if (!lane) return null;
	const last = board.laneOrder.length - 1;
	const open = expanded.has(laneId);

	const commit = (value: string) => {
		setEditing(false);
		dispatch({ type: 'retitleLane', id: laneId, title: value });
	};

	return (
		<div
			ref={setNodeRef}
			style={{
				gridColumn: 1,
				gridRow: row,
				transform: CSS.Translate.toString(transform),
				transition,
				opacity: isDragging ? 0.35 : undefined,
			}}
			className="group sticky left-0 z-[4] flex flex-col justify-center px-[0.4em] py-[0.3em]"
		>
			{editing ? (
				<input
					ref={input}
					defaultValue={lane.title}
					aria-label="Rename this lane"
					onBlur={(event) => commit(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Enter') commit(event.currentTarget.value);
						if (event.key === 'Escape') setEditing(false);
					}}
					className="w-full rounded-sm border border-slate-300 px-1 py-0.5 text-[0.72em] focus-visible:outline-2 focus-visible:outline-brand dark:border-slate-600 dark:bg-black/30"
				/>
			) : (
				<div className="flex items-start gap-[0.2em]">
					<button
						type="button"
						{...attributes}
						{...listeners}
						onClick={() => setEditing(true)}
						aria-label={`Lane ${lane.title}, ${index + 1} of ${board.laneOrder.length}`}
						className="min-w-0 flex-1 cursor-grab text-left text-[0.78em] leading-snug font-semibold break-words focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:cursor-grabbing"
					>
						{lane.title}
					</button>
					{lane.notes.length > 0 && (
						<button
							type="button"
							onClick={() => onToggleDetail(laneId)}
							aria-expanded={open}
							aria-label={`${open ? 'Hide' : 'Show'} the notes on ${lane.title}`}
							className="shrink-0 rounded-sm text-ink-muted hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand dark:text-slate-400"
						>
							<Icon name={open ? 'up' : 'down'} className="h-[0.9em] w-[0.9em]" />
						</button>
					)}
					<CardMenu label={`Lane ${lane.title}`} actions={laneMenu(board, dispatch, laneId, index, last)} />
				</div>
			)}

			{open && lane.notes.length > 0 && (
				<p className="mt-[0.2em] text-[0.66em] leading-snug break-words whitespace-pre-line text-ink-muted dark:text-slate-400">
					{lane.notes.join('\n\n')}
				</p>
			)}
		</div>
	);
}

/**
 * One square of the board: a drop target, a stack of notes, and a way in.
 *
 * Every square exists in the DOM, unlike `cells`, which only holds the occupied
 * ones. An empty square is a drop target and a place to put the first note, so
 * it has to be there — it is one dashed outline and costs nothing.
 *
 * The `+` appears on hover or focus. There are lanes × columns of these and a
 * permanent control on each would be a screen of plus signs; the strip that
 * opens is the legend as well as the control, so it teaches the notation at the
 * moment somebody is choosing a colour.
 *
 * ## Not while the pointer is on a note
 *
 * Hovering anywhere in the square used to open the strip, notes included, and a
 * square is mostly notes once it holds any. So reading the wall — running the
 * pointer along a row of events to see what is there — flickered a row of
 * swatches under every note it passed, and the answer to "what is on this
 * square" arrived with an offer to put something else on it.
 *
 * The strip belongs to the empty part of the square, which is the part that
 * means "there is room here". So it hides while the pointer is over the notes
 * and comes back the moment it leaves them. Keyboard focus still opens it —
 * `focus-within` is unconditional — because there is no pointer to be over
 * anything, and tabbing to the strip is the only way in without a mouse.
 */
function Square({
	board,
	dispatch,
	laneId,
	column,
	row,
	expanded,
	onToggleDetail,
	selected,
	onSelect,
}: {
	board: BoardState;
	dispatch: (action: BoardAction) => void;
	laneId: Id;
	column: number;
	row: number;
	expanded: ReadonlySet<Id>;
	onToggleDetail: (id: Id) => void;
	/** Passed through to the notes: a square is not itself selectable. */
	selected: { kind: 'lane' | 'card'; id: Id } | null;
	onSelect: (pick: { kind: 'lane' | 'card'; id: Id }) => void;
}) {
	const key = cellKey(laneId, column);
	const { setNodeRef, isOver } = useDroppable({ id: `square:${key}`, data: { accepts: 'card', cell: key } });
	const ids = cardsAt(board, laneId, column);
	const lane = board.lanes[laneId];
	const where = `${lane?.title ?? 'this lane'}, column ${column}`;
	/**
	 * Whether the pointer is on the notes rather than on the square around them.
	 *
	 * State rather than a `:has(…)` variant on the strip, because that would be
	 * two hover rules on the same element decided by specificity — and this file
	 * already documents one Tailwind failure that compiles, runs and produces
	 * nothing. This one is readable and it can be tested.
	 */
	const [onNotes, setOnNotes] = useState(false);

	return (
		<div
			ref={setNodeRef}
			// `minHeight` as an inline style, not a class. Tailwind scans source text
			// and cannot see a class name built at runtime, so `min-h-[${SQUARE}]`
			// would compile, run, and produce squares with no height — a failure
			// with no error attached. Same trap kinds.ts documents for the colours.
			style={{ gridColumn: column + 1, gridRow: row, minHeight: SQUARE }}
			// Named for KindPalette, which anchors its preview to the square rather
			// than to the swatch inside it — see the placement note there. An
			// attribute rather than a class so the selector cannot be broken by a
			// restyle.
			data-square=""
			// The square's own leave, as well as the list's: a note deleted or
			// dragged out from under the pointer never sends `pointerleave`, and
			// without this the strip would stay hidden until the pointer moved
			// again.
			onPointerLeave={() => setOnNotes(false)}
			/*
			 * The grid has to be *seen*, in both themes.
			 *
			 * It was `slate-200/70` on white and `slate-700/70` on the night ground,
			 * which measure 1.15:1 and 1.36:1 against what they sit on — a line you
			 * can find if you know it is there and cannot follow across a wall. And
			 * the grid is not decoration here: a square is where a note goes, the
			 * empty ones are the wall's own account of what has not been said yet,
			 * and the column a note sits in is half of what it means.
			 *
			 * Now 2.56:1 in daylight and 3.46:1 at night — measured, not guessed,
			 * against the composited backgrounds. Not the same step on both sides,
			 * because they are not symmetric: a grey line loses more of itself
			 * against a dark ground than the mirror-image grey does against white,
			 * so the night side is one stop lighter to arrive at the same legibility.
			 *
			 * Still dashed, and still a stop below the controls around it. This is
			 * the ruling on the paper, not the writing on it — and `isOver` has to
			 * stay unmistakably louder than either, since that one says a note is
			 * about to land here.
			 */
			className={`group/sq relative flex flex-col gap-[0.15em] rounded-[0.3em] border border-dashed p-[0.15em] transition-colors motion-reduce:transition-none ${
				isOver
					? 'border-brand bg-brand/5 dark:border-sky-400 dark:bg-sky-400/10'
					: 'border-slate-400 dark:border-slate-500'
			}`}
		>
			<ul
				aria-label={`Notes at ${where}`}
				className="flex flex-col gap-[0.15em]"
				onPointerEnter={() => setOnNotes(true)}
				onPointerLeave={() => setOnNotes(false)}
			>
				<SortableContext items={[...ids]} strategy={verticalListSortingStrategy}>
					{ids.map((id, index) => {
						const card = board.cards[id];
						if (!card) return null;
						return (
							<li key={id}>
								<StickyNote
									id={id}
									board={board}
									dispatch={dispatch}
									cell={key}
									position={`${index + 1} of ${ids.length} at ${where}`}
									expanded={expanded}
									onToggleDetail={onToggleDetail}
									selected={selected?.kind === 'card' && selected.id === id}
									onSelect={() => onSelect({ kind: 'card', id })}
								/>
							</li>
						);
					})}
				</SortableContext>
			</ul>

			{/* Only the kinds this level admits. The strip is the legend as well as
			    the control, so offering a colour the notation does not currently
			    have would be teaching the wrong notation. Hovering one shows the
			    note it would make — see KindPalette. */}
			<div
				className={`opacity-0 transition focus-within:opacity-100 motion-reduce:transition-none ${
					onNotes ? '' : 'group-hover/sq:opacity-100'
				}`}
			>
				<KindPalette
					kinds={kindsFor(board.level)}
					where={where}
					onAdd={(kind) => dispatch({ type: 'addCard', laneId, column, kind })}
				/>
			</div>
		</div>
	);
}

/**
 * What a note is anchored to: its rectangle, its type size, and its theme.
 *
 * Read off the note at the moment the pointer arrives rather than passed down,
 * because all three are facts about how the note is being *drawn* — the zoom
 * decides the size, the board's own light/dark override decides the theme, and
 * neither is known to the note's props.
 */
type Anchor = { top: number; bottom: number; left: number; width: number; fontSize: string; theme: string | null };

function anchorOf(element: HTMLElement): Anchor {
	const box = element.getBoundingClientRect();
	return {
		top: box.top,
		bottom: box.bottom,
		left: box.left,
		width: box.width,
		// The note's own computed size, so the caption is set in the same type as
		// the words it is about — at 100% and at 160%, without a second number to
		// keep in step with the zoom.
		fontSize: getComputedStyle(element).fontSize,
		theme: element.closest('[data-theme]')?.getAttribute('data-theme') ?? null,
	};
}

/**
 * The caption under the pointer: what kind of note this is, and what that means.
 *
 * Portalled and `fixed`, for the reason KindPalette gives at length: the wall
 * lives in an `overflow: auto` scroller that clips any child reaching past its
 * edge, and a caption on a note in the last column or the bottom lane would be
 * sliced in half or cut off entirely.
 *
 * Positioned after it is measured rather than from a guess. It is two short
 * lines and its height depends on the zoom, the wrapping and the length of the
 * meaning, so it is rendered invisible, measured once, and revealed in place —
 * one frame, and never a caption seen in the wrong position first.
 *
 * `aria-hidden`, like the palette's preview: the note's accessible name already
 * opens with the kind, and a second copy in a floating box is noise. This is
 * for the eye.
 */
function NoteTooltip({ kind, anchor }: { kind: CardKind; anchor: Anchor }) {
	const box = useRef<HTMLDivElement>(null);
	const [at, setAt] = useState<{ top: number; left: number } | null>(null);

	useLayoutEffect(() => {
		const element = box.current;
		if (!element) return;
		const { width, height } = element.getBoundingClientRect();

		// Above the note by default — the pointer is on the note, and a caption
		// under it would be the thing the pointer moves onto next. Flipped below
		// when the note is near the top of the window.
		const above = anchor.top - GAP - height;
		const top = above >= EDGE ? above : Math.min(anchor.bottom + GAP, window.innerHeight - EDGE - height);

		const centred = anchor.left + anchor.width / 2 - width / 2;
		const left = Math.max(EDGE, Math.min(centred, window.innerWidth - width - EDGE));
		setAt({ top, left });
	}, [anchor, kind]);

	return createPortal(
		<div
			ref={box}
			aria-hidden="true"
			// The board's light/dark override, carried across the portal: this
			// element is in the body, not in the board.
			data-theme={anchor.theme ?? undefined}
			style={{
				position: 'fixed',
				top: at?.top ?? anchor.top,
				left: at?.left ?? anchor.left,
				// The whole box is sized in `em` against this, so the padding, the
				// corner and the measure all follow the note's size too.
				fontSize: anchor.fontSize,
				maxWidth: '22em',
				// Invisible for the frame it is being measured in. `visibility`
				// rather than `display`, which would leave nothing to measure.
				visibility: at === null ? 'hidden' : undefined,
			}}
			className="pointer-events-none z-40 rounded-[0.4em] border border-slate-200 bg-white px-[0.6em] py-[0.45em] text-ink shadow-lg dark:border-slate-700 dark:bg-night-raised dark:text-slate-100"
		>
			<p className="font-semibold">{cardLabel[kind]}</p>
			<p className="mt-[0.15em] leading-snug text-ink-muted dark:text-slate-400">{cardMeaning[kind]}</p>
		</div>,
		document.fullscreenElement ?? document.body,
	);
}

/**
 * One note: a square of colour with a few words on it.
 *
 * The words are clamped rather than allowed to grow the note. A wall is a grid
 * of equal squares, and a note that stretched to fit its text would push its
 * neighbours out of line — the arrangement is the information here, so the
 * arrangement wins and the full text lives in the accessible name.
 *
 * That is also a nudge the practice itself makes: a domain event is three or
 * four words in the past tense. A note that does not fit is usually two notes.
 *
 * ## The tooltip says what the note *is*, not what it says
 *
 * It used to be `title={card.title}` — the words already on the note, printed a
 * second time a beat later, under the pointer. That is a tooltip that answers a
 * question nobody asked: the text is right there, and if it is clamped the note
 * is too long for a wall anyway.
 *
 * What is genuinely invisible is the taxonomy. The kinds are carried by colour
 * alone once the legend is closed, orange and yellow are one hue apart, and
 * "which of the eleven is this" is the question a wall actually raises — the
 * same question `KindPalette` answers while somebody is choosing a colour. So
 * the tooltip gives the name and the meaning, in the practice's own words and
 * from the same two maps the palette reads. The full text is still on the
 * accessible name, which is where a screen reader was always getting it.
 *
 * It is a real element rather than a `title`, for one reason: a native tooltip
 * is drawn by the browser in the browser's own type, at a size no page can set,
 * and the board is a zoomable surface whose notes are read at whatever size the
 * zoom put them. A caption a third the size of the note it explains is a
 * caption nobody reads on a wall projected on a meeting-room screen. So it is
 * `NoteTooltip`, and it takes its font size from the note it is describing.
 */
function StickyNote({
	id,
	board,
	dispatch,
	cell,
	position,
	expanded,
	onToggleDetail,
	selected,
	onSelect,
}: {
	id: Id;
	board: BoardState;
	dispatch: (action: BoardAction) => void;
	cell: string;
	position: string;
	expanded: ReadonlySet<Id>;
	onToggleDetail: (id: Id) => void;
	/** Whether the source pane is emphasising this note's declaration. */
	selected: boolean;
	onSelect: () => void;
}) {
	const card = board.cards[id];
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id,
		data: { type: 'card', cell },
	});
	const [editing, setEditing] = useState(false);
	const input = useRef<HTMLTextAreaElement>(null);
	/** Where the taxonomy caption is anchored, or null when it is not shown. */
	const [tip, setTip] = useState<Anchor | null>(null);

	useEffect(() => {
		if (editing) {
			input.current?.focus();
			input.current?.select();
		}
	}, [editing]);

	if (!card) return null;
	const open = expanded.has(id);
	const label = `${cardLabel[card.kind]}: ${card.title}, ${position}`;

	return (
		<div
			ref={setNodeRef}
			style={{
				transform: CSS.Translate.toString(transform),
				transition,
				opacity: isDragging ? 0.35 : undefined,
			}}
			onClick={onSelect}
			// The ring is `inset` so selecting does not grow the note and shift the
			// wall around it.
			className={`relative rounded-[0.2em] border px-[0.25em] py-[0.2em] text-[0.6em] leading-tight shadow-sm ${
				selected ? 'ring-2 ring-brand ring-inset dark:ring-sky-400' : ''
			} ${cardClass[card.kind]}`}
		>
			{editing ? (
				<textarea
					ref={input}
					rows={3}
					defaultValue={card.title}
					aria-label={`Rewrite this ${cardLabel[card.kind].toLowerCase()}`}
					onBlur={(event) => {
						setEditing(false);
						dispatch({ type: 'retitleCard', id, title: event.target.value });
					}}
					onKeyDown={(event) => {
						// One note, one line of words: Enter is a verdict, not a break.
						if (event.key === 'Enter') {
							event.preventDefault();
							event.currentTarget.blur();
						}
						if (event.key === 'Escape') {
							event.preventDefault();
							setEditing(false);
						}
					}}
					className="w-full resize-none bg-white/70 text-[1em] leading-tight text-ink focus-visible:outline-2 focus-visible:outline-brand dark:bg-black/30 dark:text-slate-100"
				/>
			) : (
				<div className="flex items-start gap-[0.1em]">
					<button
						type="button"
						{...attributes}
						{...listeners}
						onClick={() => setEditing(true)}
						onPointerEnter={(event) => setTip(anchorOf(event.currentTarget))}
						onPointerLeave={() => setTip(null)}
						// A note being picked up is not a note being asked about, and a
						// caption travelling with the pointer through a drag would sit on
						// top of the wall the drop is being aimed at.
						onPointerDown={() => setTip(null)}
						aria-label={label}
						className="line-clamp-4 min-w-0 flex-1 cursor-grab text-left break-words hyphens-auto focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand active:cursor-grabbing"
					>
						{card.title}
					</button>
					{tip !== null && <NoteTooltip kind={card.kind} anchor={tip} />}
					{card.notes.length > 0 && (
						<button
							type="button"
							onClick={() => onToggleDetail(id)}
							aria-expanded={open}
							aria-label={`${open ? 'Hide' : 'Show'} the notes on ${card.title}`}
							className="shrink-0 opacity-60 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
						>
							<Icon name={open ? 'up' : 'down'} className="h-[1em] w-[1em]" />
						</button>
					)}
					<CardMenu label={label} actions={cardMenu(board, dispatch, id, card.kind)} />
				</div>
			)}

			{open && card.notes.length > 0 && (
				<p className="mt-[0.15em] break-words whitespace-pre-line opacity-80">{card.notes.join('\n\n')}</p>
			)}
		</div>
	);
}

/**
 * Re-colouring a note is offered, and it is the commonest correction there is.
 *
 * Half of what a wall does in its second hour is discovering that a note is the
 * wrong colour — an "event" that is really a hotspot, a "system" that is really
 * an actor. On paper you rewrite it on a different sticky; here it is one click,
 * and the note keeps its words and its square.
 */
function cardMenu(
	board: BoardState,
	dispatch: (action: BoardAction) => void,
	id: Id,
	current: CardKind,
): CardMenuAction[] {
	const card = board.cards[id];
	return [
		{
			label: 'Add a note',
			run: () =>
				dispatch({
					type: 'setCardNotes',
					id,
					text: card && card.notes.length > 0 ? `${card.notes.join('\n\n')}\n\nNew note` : 'New note',
				}),
		},
		// Re-colouring is offered only within this level's notation, for the same
		// reason the `+` strip is: a board must not be able to place a card the
		// file it writes could not describe.
		...kindsFor(board.level)
			.filter((kind) => kind !== current)
			.map((kind, position) => ({
				label: `Make it ${cardLabel[kind].toLowerCase()}`,
				separated: position === 0,
				run: () => dispatch({ type: 'setCardKind', id, kind }),
			})),
		{ label: 'Remove this note', separated: true, run: () => dispatch({ type: 'removeCard', id }) },
	];
}

function laneMenu(
	board: BoardState,
	dispatch: (action: BoardAction) => void,
	id: Id,
	index: number,
	last: number,
): CardMenuAction[] {
	const lane = board.lanes[id];
	const only = board.laneOrder.length === 1;
	return [
		{
			label: 'Add a note',
			run: () =>
				dispatch({
					type: 'setLaneNotes',
					id,
					text: lane && lane.notes.length > 0 ? `${lane.notes.join('\n\n')}\n\nNew note` : 'New note',
				}),
		},
		{
			label: 'Move up',
			separated: true,
			run: index > 0 ? () => dispatch({ type: 'moveLane', id, index: index - 1 }) : undefined,
			disabledReason: index > 0 ? undefined : 'It is already first.',
		},
		{
			label: 'Move down',
			run: index < last ? () => dispatch({ type: 'moveLane', id, index: index + 1 }) : undefined,
			disabledReason: index < last ? undefined : 'It is already last.',
		},
		{ label: 'Add a lane below', separated: true, run: () => dispatch({ type: 'addLane', index: index + 1 }) },
		{
			// The last one is emptied rather than deleted — otherwise there is no
			// square left to place anything on. The label says which.
			label: only ? 'Clear the wall' : 'Delete the lane and its notes',
			separated: true,
			run: () => dispatch({ type: 'removeLane', id }),
		},
	];
}
