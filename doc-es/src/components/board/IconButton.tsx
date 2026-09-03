/**
 * An icon-only button, and the tooltip that makes one usable.
 *
 * Two rules hold here, and neither is optional.
 *
 * **The label is always present.** `aria-label` carries it to assistive
 * technology, so nothing on this board is reachable only by recognising a glyph.
 *
 * **The tooltip appears on focus, not only on hover.** A `title` attribute — the
 * usual shortcut — is a mouse-only affordance: it never appears for somebody
 * tabbing through the toolbar, which is precisely the person who cannot see a
 * pointer resting on the button. So the tooltip is a real element, revealed on
 * hover *and* on keyboard focus — see `TOOLTIP` for which flavour of focus and
 * why the difference matters — and marked `aria-hidden` because the accessible
 * name already says the same words.
 *
 * ## The hub's one icon-button metric
 *
 * The same four numbers hold here, in the other two boards and in
 * ba-ddd-mapper's `src/components/ui/IconButton.tsx`, so that moving between
 * the five tools does not move the controls under the pointer: a 36px box for a
 * toolbar, a 28px box for a control that sits *on* a canvas or a rail, a 21px
 * glyph in the first and a 16px glyph in the second.
 *
 * The glyph was 18px until the estate settled on one number. It is the only one
 * of the four that moved, and it moved here rather than in the mapper because
 * the mapper's is the size somebody asked for.
 */

import type { MouseEvent } from 'react';
import type { IconName } from '../../lib/board/icons.ts';
import { Icon } from './Icon.tsx';

/**
 * The tooltip pill, without a position.
 *
 * ## Hover, and keyboard focus — but not the focus a click leaves behind
 *
 * `group-has-[:focus-visible]` rather than `group-focus-within`, which is what
 * this was and what was wrong with it. `:focus-within` matches whenever a
 * descendant holds focus *however it got there*, and a clicked button holds
 * focus until something else takes it — so the tooltip stayed up after the
 * pointer had left, and the control that showed it worst was the level row,
 * whose chips are radios you click to choose rather than buttons you press and
 * forget. A caption pinned to a control nobody is pointing at any more reads as
 * a stuck element, not as help.
 *
 * `:focus-visible` is the browser's own judgement about whether focus deserves
 * to be *seen* — keyboard yes, mouse no — which is exactly the distinction this
 * needs, and exactly what the paragraph at the top of this file always claimed
 * was here. Wrapped in `:has()` because the group is the span, and the thing
 * taking focus is the button inside it.
 *
 * Exported because it is now worn by two different controls — this button and
 * the level row's chips — and a second hand-copied Tailwind string is a second
 * thing to forget when the colour or the timing changes. `GAP` and `EDGE` in
 * KindPalette are shared for the same reason: two floating layers that drifted
 * apart by a pixel would look like a bug in one of them.
 *
 * Position is left to the caller, and deliberately. Where a tooltip may grow to
 * depends on where its control sits on the page, which is the one thing this
 * file cannot know — see the note beside the level row's copy.
 */
export const TOOLTIP =
	'pointer-events-none absolute z-50 rounded-md bg-ink px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 group-has-[:focus-visible]:opacity-100 motion-reduce:transition-none dark:bg-slate-200 dark:text-ink';

export type IconButtonTone = 'plain' | 'primary' | 'danger';

const TONES: Record<IconButtonTone, string> = {
	plain:
		'border border-slate-300 hover:border-brand hover:text-brand dark:border-slate-600 dark:hover:border-sky-400 dark:hover:text-sky-400',
	// Export is the only way work leaves this tab, so it stays visually distinct
	// even now that it has no words. An icon-only primary that looked like every
	// other button would make the one control that saves anything the hardest to
	// find.
	primary: 'border border-transparent bg-brand text-white hover:bg-brand-strong',
	danger: 'border border-transparent hover:text-critical',
};

/*
 * What a toggle looks like when it is on.
 *
 * It replaces the tone rather than adding to it: the only pressed buttons are
 * plain ones, and a filled `primary` that could also be pressed would be saying
 * two things with one fill. The treatment is ba-ddd-mapper's, in this palette —
 * the same control should read the same in both lineages.
 */
const PRESSED =
	'border border-brand bg-white text-brand dark:border-sky-400 dark:bg-night-raised dark:text-sky-400';

export function IconButton({
	icon,
	label,
	onClick,
	disabled = false,
	pressed,
	tone = 'plain',
	size = 'md',
	tooltip = size === 'sm' ? 'native' : 'element',
}: {
	icon: IconName;
	/** The accessible name, and the tooltip text. Always both. */
	label: string;
	/**
	 * The click handler, given the event.
	 *
	 * Widened from `() => void` for the one control that reads a modifier — the
	 * board's theme switch, where shift-click means "follow the page again". Every
	 * other caller ignores the argument, which is why widening it was cheaper than
	 * a second button component.
	 */
	onClick: (event: MouseEvent<HTMLButtonElement>) => void;
	disabled?: boolean;
	/**
	 * Omitted by the buttons that *do* something.
	 *
	 * Present only on the ones that put the bar into a state — the legend toggle
	 * is the first — where a reader has to be able to see which state that is.
	 * `aria-pressed` says the same thing the fill says, and a toggle that only
	 * said it in colour would be saying it to nobody using a screen reader.
	 */
	pressed?: boolean;
	tone?: IconButtonTone;
	size?: 'sm' | 'md';
	/**
	 * `element` draws the tooltip below the button; `native` falls back to a
	 * `title` attribute.
	 *
	 * The distinction is about clipping, not taste. The band rail's controls live
	 * inside the board's `overflow: auto` scroll container, and an absolutely
	 * positioned tooltip is clipped at that container's edge — the same trap that
	 * makes DragOverlay mandatory in StoryMapBoard. A native tooltip is drawn by
	 * the browser outside the document, so it cannot be clipped.
	 *
	 * `title` is mouse-only, which is why it is not the default. It is acceptable
	 * here because these particular controls are duplicated for keyboard users:
	 * every band move and delete is also reachable from a card's menu, and the
	 * `aria-label` below is the accessible name either way.
	 */
	tooltip?: 'element' | 'native';
}) {
	const box = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9';

	return (
		<span className="group relative inline-flex">
			<button
				type="button"
				onClick={onClick}
				disabled={disabled}
				aria-label={label}
				aria-pressed={pressed}
				title={tooltip === 'native' ? label : undefined}
				className={`inline-flex ${box} items-center justify-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none ${
					pressed ? PRESSED : TONES[tone]
				}`}
			>
				<Icon name={icon} className={size === 'sm' ? 'h-4 w-4' : 'h-[1.3125rem] w-[1.3125rem]'} />
			</button>

			{/* No `role="tooltip"`: the accessible name already carries these words,
			    and a tooltip role on a hidden element only invites a second reading
			    of the same string. This element is here for eyes. */}
			{tooltip === 'element' && (
			<span
				aria-hidden="true"
				className={`${TOOLTIP} top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap`}
			>
				{label}
			</span>
			)}
		</span>
	);
}
