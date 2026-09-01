/**
 * The `+` selectors at the foot of a square, and the picture of what each makes.
 *
 * Five to ten swatches the size of a fingernail is a fast control once you know
 * the notation and an unreadable one until then — and the notation is exactly
 * what a first-time visitor does not have. A `title` tooltip says the right
 * words, but it says them in the browser's smallest type, after a delay, in a
 * corner of the screen away from the colour it is describing.
 *
 * So hovering one shows the note it would make: the real card, at a readable
 * size, in its own colour, carrying the very words the click will put on it.
 * The name and the meaning sit underneath. It is the legend again, arriving at
 * the moment somebody is choosing rather than at the top of the page where they
 * read it ten minutes ago.
 *
 * ## It has to be portalled
 *
 * The squares live inside an `overflow: auto` scroller, which clips any child
 * that reaches past its edge — the same trap that makes DragOverlay mandatory in
 * EventStormBoard and portalling mandatory in CardMenu. A preview anchored to a
 * square near the right-hand edge would be sliced in half, and one on the bottom
 * row would be cut off entirely.
 *
 * So it is rendered into the body and positioned `fixed`, which also means it
 * can never be painted under a sticky row. The portal target is the fullscreen
 * element when there is one, because content outside that element is not
 * painted at all.
 *
 * ## It lands on the next square along, not on this one
 *
 * It used to sit directly above the swatch, which put it over the square the
 * strip belongs to — so the preview of the note you were about to add covered
 * the notes you were adding it next to, which is the one piece of context that
 * decides whether you want it. A wall is read by its neighbourhood.
 *
 * So it is anchored to the square rather than to the swatch, and placed beside
 * it: one gap to the right, over the next square along, flipped to the left
 * when the wall's right-hand edge is closer than the preview is wide. Only when
 * neither side has room does it fall back to the middle of the window. The
 * square stays visible in every case, which is the whole point.
 *
 * ## It is decoration, and says so
 *
 * `aria-hidden`, and the buttons keep their `aria-label`. A screen reader user
 * already has the full name read to them on focus; a second copy in a floating
 * box is noise. This exists for the eye.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cardLabel, cardMeaning, newCardTitle, type CardKind } from '../../lib/eventstorm/model.ts';
import { cardClass, swatchClass } from '../../lib/board/kinds.ts';
import { Icon } from './Icon.tsx';

/**
 * The box, in `em` against the square's own type — which is the board's zoom.
 *
 * Not px. The preview's whole claim is that it shows the note you would get, at
 * the size you would read it, and a box fixed in px would hold that note at
 * 160% zoom in a frame built for 100%. Wide enough for the meaning to sit on
 * two or three lines at a comfortable measure; the height is only a guess for
 * the flip decision, and the measured correction in `Preview` fixes it.
 */
const PREVIEW_WIDTH_EM = 8.5;
const PREVIEW_HEIGHT_EM = 6;
/**
 * How far a floating box sits from what it describes, and from the window's
 * edge. Exported because `NoteTooltip` in BoardGrid.tsx is the same kind of box
 * — portalled, `fixed`, anchored to something inside the scroller — and two
 * floating layers that drifted apart by a pixel would look like a bug in one of
 * them.
 */
export const GAP = 8;
export const EDGE = 8;

export function KindPalette({
	kinds,
	where,
	onAdd,
}: {
	/** The kinds this level admits, already filtered. */
	kinds: readonly CardKind[];
	/** Where the note would land, for the accessible name: "Customer, column 3". */
	where: string;
	onAdd: (kind: CardKind) => void;
}) {
	const [showing, setShowing] = useState<{
		kind: CardKind;
		top: number;
		left: number;
		/** The square's own type size and the box built from it, both in px. */
		fontSize: number;
		width: number;
		/** The board's theme, read off the trigger — which is inside the board. */
		theme: string | null;
	} | null>(null);

	const open = (kind: CardKind, element: HTMLElement) => {
		// The square, not the swatch: the preview belongs beside the square it
		// would add to. `data-square` is set in BoardGrid; falling back to the
		// swatch keeps this working if the strip is ever used somewhere else.
		const square = element.closest('[data-square]') ?? element;
		const box = square.getBoundingClientRect();

		// The square's type size *is* the board's zoom — a note's words are
		// `text-[0.6em]` of it — so the preview is built from it and the mock note
		// inside carries that same literal. One number, read from the thing being
		// added to, and nothing to keep in step when the zoom moves.
		const fontSize = Number.parseFloat(getComputedStyle(square).fontSize) || 16;
		const width = PREVIEW_WIDTH_EM * fontSize;
		const height = PREVIEW_HEIGHT_EM * fontSize;

		// To the right, over the next square along. Left when the right-hand edge
		// is nearer than the preview is wide, and centred in the window only when
		// neither side can hold it — a laptop with the board zoomed in.
		const right = box.right + GAP;
		const left_ = box.left - GAP - width;
		const left =
			right + width <= window.innerWidth - EDGE
				? right
				: left_ >= EDGE
					? left_
					: Math.max(EDGE, (window.innerWidth - width) / 2);

		// Level with the square, so the two read as a pair, and pulled up only as
		// far as the window demands. The measured correction below does the rest
		// when the guessed height was short.
		const top = Math.max(EDGE, Math.min(box.top, window.innerHeight - EDGE - height));

		setShowing({
			kind,
			top,
			left,
			fontSize,
			width,
			theme: element.closest('[data-theme]')?.getAttribute('data-theme') ?? null,
		});
	};

	return (
		<div className="flex flex-wrap gap-[0.1em]">
			{kinds.map((kind) => (
				<button
					key={kind}
					type="button"
					onClick={() => onAdd(kind)}
					onMouseEnter={(event) => open(kind, event.currentTarget)}
					onFocus={(event) => open(kind, event.currentTarget)}
					onMouseLeave={() => setShowing(null)}
					onBlur={() => setShowing(null)}
					aria-label={`Add ${cardLabel[kind].toLowerCase()} at ${where}`}
					className={`flex h-[1.15em] w-[1.15em] items-center justify-center rounded-[0.15em] border focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand ${swatchClass[kind]}`}
				>
					<Icon name="plus" className="h-[0.7em] w-[0.7em]" />
				</button>
			))}

			{showing !== null && (
				<Preview
					kind={showing.kind}
					top={showing.top}
					left={showing.left}
					fontSize={showing.fontSize}
					width={showing.width}
					theme={showing.theme}
				/>
			)}
		</div>
	);
}

function Preview({
	kind,
	top,
	left,
	fontSize,
	width,
	theme,
}: {
	kind: CardKind;
	top: number;
	left: number;
	/** The square's type size, in px: everything in here is `em` against it. */
	fontSize: number;
	width: number;
	theme: string | null;
}) {
	const box = useRef<HTMLDivElement>(null);

	/*
	 * Nudge up if the guessed height was short.
	 *
	 * The position is computed from an estimate, because the box does not exist
	 * until it is rendered and rendering it to measure would show it in the wrong
	 * place first. Measuring afterwards and correcting only when it overflows is
	 * one frame of adjustment in the rare case, rather than a flicker in every
	 * case.
	 */
	const [nudge, setNudge] = useState(0);
	useLayoutEffect(() => {
		const height = box.current?.getBoundingClientRect().height ?? 0;
		const overflow = top + height - (window.innerHeight - EDGE);
		setNudge(overflow > 0 ? -overflow : 0);
	}, [top, kind, fontSize]);

	return createPortal(
		<div
			ref={box}
			aria-hidden="true"
			// The board's light/dark override, carried across the portal — this
			// element is in the body, not in the board. Read off the trigger, which
			// *is* in the board, for the reason CardMenu gives.
			data-theme={theme ?? undefined}
			style={{ position: 'fixed', top: top + nudge, left, width, fontSize: `${fontSize}px` }}
			// Every portalled root restates the colour pair, for the reason CardMenu
			// gives: outside the board's subtree, an uncoloured string inherits from
			// a `<body>` that follows the operating system rather than the board.
			// This one's children all colour themselves, so it is a guard against
			// the next edit rather than a fix.
			className="pointer-events-none z-40 rounded-[0.4em] border border-slate-200 bg-white p-[0.4em] text-ink shadow-lg dark:border-slate-700 dark:bg-night-raised dark:text-slate-100"
		>
			{/* The note itself, at the size a note is actually read at — which is
			    the whole point of this box existing. `text-[0.6em]` is the literal
			    StickyNote uses, against the same square-sized `em`, so the picture
			    and the thing it is a picture of are set in one size at every zoom. */}
			<div
				className={`rounded-[0.2em] border px-[0.4em] py-[0.55em] text-center text-[0.6em] leading-tight shadow-sm ${cardClass[kind]}`}
			>
				{newCardTitle[kind]}
			</div>
			<p className="mt-[0.3em] text-[0.6em] font-semibold text-ink dark:text-slate-100">{cardLabel[kind]}</p>
			<p className="mt-[0.1em] text-[0.6em] leading-snug text-ink-muted dark:text-slate-400">
				{cardMeaning[kind]}
			</p>
		</div>,
		document.fullscreenElement ?? document.body,
	);
}
