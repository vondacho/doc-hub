/**
 * The source pane: the `.storymap` file, edited in place.
 *
 * ba-ddd-mapper's `src/components/mapper/Editor.tsx`, ported. A textarea with a
 * line-number gutter, and deliberately not a code editor — CodeMirror or Monaco
 * would bring syntax highlighting, folding and an autocomplete for eleven card
 * keywords, and about 300KB, a second island's worth of complexity, and a text
 * model that is no longer just a string. The string is the point: every gesture
 * on the board is a splice into it.
 *
 * The gutter is a second element scrolled in lockstep rather than a repeating
 * `background-image`, because the line height has to survive a browser zoom and
 * a repeating gradient does not.
 *
 * ## Highlighting a range inside a textarea
 *
 * A textarea has no styleable ranges — there is no way to give a slice of its
 * value a background. The way this is done everywhere is a *backdrop*: a second
 * element holding the same text, with the same font, padding and wrapping, sat
 * exactly underneath a transparent textarea and scrolled with it. The backdrop's
 * text is invisible and only the highlight's box paints; the real characters you
 * see and edit are the textarea's, on top.
 *
 * Two things keep it honest, and both are load-bearing rather than cosmetic:
 * every metric that affects where a glyph lands is declared once on the shared
 * wrapper, and the backdrop is scrolled from the textarea's own scroll event. If
 * the two ever disagree the highlight lands on the wrong words, which is worse
 * than no highlight — so the classes they must share sit together below.
 */

import { useEffect, useRef } from 'react';
import type { Problem } from '../../lib/storymap/problems.ts';

/**
 * The type sizes the source pane offers, smallest first.
 *
 * Stops rather than a free number, for the reason the board's zoom has stops:
 * the useful range is small, every step has to stay legible in a monospace
 * face, and a spinner that can produce 14.5px is a control nobody wants to
 * operate. Five of them, so the ends are reachable in two presses.
 *
 * 15px is where the pane sits by default and where the reset returns to.
 */
export const TEXT_SIZES = [13, 15, 17, 19, 21] as const;
export const DEFAULT_TEXT_SIZE = 15;

export function Editor({
	value,
	onChange,
	problems,
	revealLine,
	highlight,
	textSize,
}: {
	value: string;
	onChange: (value: string) => void;
	problems: readonly Problem[];
	/** The type size for the whole pane, in px. One of `TEXT_SIZES`. */
	textSize: number;
	/** Set when a problem is clicked, to move the caret there. */
	revealLine: number | null;
	/**
	 * The byte range to emphasise, or null for none.
	 *
	 * Where the selected card is written. It comes straight from the parsed
	 * document's spans, which is the whole reason this is cheap: the board
	 * already knows, to the byte, which text a card is.
	 */
	highlight: { readonly start: number; readonly end: number } | null;
}) {
	const area = useRef<HTMLTextAreaElement>(null);
	const gutter = useRef<HTMLDivElement>(null);
	const backdrop = useRef<HTMLDivElement>(null);

	const lines = value.split('\n');
	const flagged = new Set(problems.map((problem) => problem.line));

	useEffect(() => {
		if (revealLine === null || !area.current) return;
		const offset = lines.slice(0, revealLine - 1).reduce((total, line) => total + line.length + 1, 0);
		area.current.focus();
		area.current.setSelectionRange(offset, offset + (lines[revealLine - 1]?.length ?? 0));
		// Put the line near the top rather than wherever the browser lands it.
		const lineHeight = area.current.scrollHeight / Math.max(1, lines.length);
		area.current.scrollTop = Math.max(0, (revealLine - 3) * lineHeight);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [revealLine]);

	/*
	 * Bring a newly selected card's text into view.
	 *
	 * Scrolled, not focused. Selecting a card leaves the pointer and the keyboard
	 * on the board; stealing focus into the textarea would move the caret and
	 * take the arrow keys with it, which is the opposite of what selecting a card
	 * is for. So this moves the viewport and nothing else.
	 */
	useEffect(() => {
		if (highlight === null || !area.current) return;
		const line = value.slice(0, highlight.start).split('\n').length;
		const height = area.current.scrollHeight / Math.max(1, lines.length);
		const top = (line - 1) * height;
		const view = area.current.clientHeight;
		if (top < area.current.scrollTop || top > area.current.scrollTop + view - height) {
			area.current.scrollTop = Math.max(0, top - view / 3);
			if (backdrop.current) backdrop.current.scrollTop = area.current.scrollTop;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [highlight?.start, highlight?.end]);

	/*
	 * The metrics the backdrop and the textarea must agree on, to the pixel.
	 *
	 * Declared once and used twice. Any of these differing between the two puts
	 * the highlight on the wrong words — the failure is silent and looks like a
	 * bug in the span rather than in the CSS, so they are not written out twice.
	 */
	const metrics = 'px-3 py-3 whitespace-pre-wrap break-words';

	/*
	 * The type size for the whole pane — gutter, backdrop and textarea inherit it
	 * from here, which is the same reason the metrics above are declared once.
	 * Setting it anywhere else would put the highlight on the wrong words.
	 *
	 * It is the visitor's to choose (the control is in the pane's footer, beside
	 * the problem count) and 15px is only where it starts, not what it is. The
	 * source *is* the document — the board is a render of it, every gesture is a
	 * splice into it, and it is read across a table as often as it is typed into
	 * — so the one number that decides whether it can be read at all belongs to
	 * the person reading it, not to this file.
	 *
	 * The line height stays a ratio and the gutter is measured in `em`, so both
	 * follow the size rather than having to be chosen again at each stop.
	 *
	 * The pane's own dark surfaces, and they are ba-cm's rather than this
	 * project's `night`.
	 *
	 * Everything else on the page is `night` — a neutral carrying a little of
	 * the brand hue, which is right for a surface that sits under cards and
	 * rails. The source pane is the exception on purpose: it is a page of
	 * monospace text and nothing else, read for minutes at a time, and the tint
	 * that reads as warmth behind a board reads as a cast behind a wall of
	 * glyphs. `slate-950` under `slate-900` is the near-black the mapper settled
	 * on, and the five tools share an editor, so they share its blacks.
	 *
	 * Daylight is untouched: `bg-white` on `bg-slate-50` was already the
	 * mapper's, to the class.
	 */
	return (
		<div className="flex h-full min-h-0 font-mono leading-[1.6]" style={{ fontSize: `${textSize}px` }}>
			<div
				ref={gutter}
				aria-hidden="true"
				className="w-[3.6em] shrink-0 overflow-hidden border-r border-slate-200 bg-slate-50 py-3 text-right select-none dark:border-slate-800 dark:bg-slate-900"
			>
				{lines.map((_, index) => (
					<div
						key={index}
						className={
							flagged.has(index + 1)
								? 'bg-critical/15 pr-2 font-semibold text-critical'
								: 'pr-2 text-ink-muted/50 dark:text-slate-600'
						}
					>
						{index + 1}
					</div>
				))}
			</div>

			<div className="relative min-h-0 flex-1 bg-white dark:bg-slate-950">
				{/*
				 * Invisible except for the mark. `text-transparent` hides the copy of
				 * the text; the real one is the textarea's, painted on top.
				 */}
				<div
					ref={backdrop}
					aria-hidden="true"
					className={`pointer-events-none absolute inset-0 overflow-hidden text-transparent ${metrics}`}
				>
					{highlight === null ? null : (
						<>
							{value.slice(0, highlight.start)}
							<mark className="rounded-[2px] bg-brand/25 text-transparent dark:bg-sky-400/25">
								{value.slice(highlight.start, highlight.end)}
							</mark>
							{value.slice(highlight.end)}
						</>
					)}
				</div>

			<textarea
				ref={area}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				onScroll={(event) => {
					if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop;
					if (backdrop.current) {
						backdrop.current.scrollTop = event.currentTarget.scrollTop;
						backdrop.current.scrollLeft = event.currentTarget.scrollLeft;
					}
				}}
				onKeyDown={(event) => {
					// Tab indents rather than leaving the panel. The trap is real and
					// the escape is Escape-then-Tab, which is the convention.
					if (event.key !== 'Tab' || event.shiftKey) return;
					event.preventDefault();
					const target = event.currentTarget;
					const { selectionStart, selectionEnd } = target;
					const next = `${value.slice(0, selectionStart)}  ${value.slice(selectionEnd)}`;
					onChange(next);
					requestAnimationFrame(() => target.setSelectionRange(selectionStart + 2, selectionStart + 2));
				}}
				spellCheck={false}
				autoComplete="off"
				autoCapitalize="off"
				autoCorrect="off"
				aria-label="Story map source"
				className={`absolute inset-0 h-full w-full resize-none bg-transparent text-ink outline-none focus-visible:outline-none dark:text-slate-100 ${metrics}`}
			/>
			</div>
		</div>
	);
}
