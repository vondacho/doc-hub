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
 * So it is rendered into the body and positioned `fixed` against the button's
 * own rectangle, which also means it can never be painted under a sticky row.
 * The portal target is the fullscreen element when there is one, because content
 * outside that element is not painted at all.
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

/** Wide enough for the meaning to sit on two lines at a comfortable measure. */
const PREVIEW_WIDTH = 210;
/** Enough to guess the height before it exists, for the flip decision. */
const PREVIEW_HEIGHT = 150;
const GAP = 8;
const EDGE = 8;

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
		/** The board's theme, read off the trigger — which is inside the board. */
		theme: string | null;
	} | null>(null);

	const open = (kind: CardKind, element: HTMLElement) => {
		const box = element.getBoundingClientRect();

		// Above by default, because the strip is at the *bottom* of a square and
		// the room is usually up. Flipped below when it is not.
		const above = box.top - GAP - PREVIEW_HEIGHT;
		const top = above < EDGE ? box.bottom + GAP : above;

		const centred = box.left + box.width / 2 - PREVIEW_WIDTH / 2;
		const left = Math.max(EDGE, Math.min(centred, window.innerWidth - PREVIEW_WIDTH - EDGE));

		setShowing({ kind, top, left, theme: element.closest('[data-theme]')?.getAttribute('data-theme') ?? null });
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
				<Preview kind={showing.kind} top={showing.top} left={showing.left} theme={showing.theme} />
			)}
		</div>
	);
}

function Preview({
	kind,
	top,
	left,
	theme,
}: {
	kind: CardKind;
	top: number;
	left: number;
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
	}, [top, kind]);

	return createPortal(
		<div
			ref={box}
			aria-hidden="true"
			// The board's light/dark override, carried across the portal — this
			// element is in the body, not in the board. Read off the trigger, which
			// *is* in the board, for the reason CardMenu gives.
			data-theme={theme ?? undefined}
			style={{ position: 'fixed', top: top + nudge, left, width: PREVIEW_WIDTH }}
			// Every portalled root restates the colour pair, for the reason CardMenu
			// gives: outside the board's subtree, an uncoloured string inherits from
			// a `<body>` that follows the operating system rather than the board.
			// This one's children all colour themselves, so it is a guard against
			// the next edit rather than a fix.
			className="pointer-events-none z-40 rounded-xl border border-slate-200 bg-white p-3 text-ink shadow-lg dark:border-slate-700 dark:bg-night-raised dark:text-slate-100"
		>
			{/* The note itself, at the size a note is actually read at — which is
			    the whole point of this box existing. */}
			<div
				className={`rounded-[0.2em] border px-2 py-3 text-center text-xs leading-tight shadow-sm ${cardClass[kind]}`}
			>
				{newCardTitle[kind]}
			</div>
			<p className="mt-2 text-xs font-semibold text-ink dark:text-slate-100">{cardLabel[kind]}</p>
			<p className="mt-0.5 text-[0.7rem] leading-snug text-ink-muted dark:text-slate-400">{cardMeaning[kind]}</p>
		</div>,
		document.fullscreenElement ?? document.body,
	);
}
