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
 * pointer resting on the button. So the tooltip is a real element, revealed by
 * `group-hover` *and* `group-focus-visible`, and marked `aria-hidden` because
 * the accessible name already says the same words.
 */

import type { IconName } from '../../lib/board/icons.ts';
import { Icon } from './Icon.tsx';

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

export function IconButton({
	icon,
	label,
	onClick,
	disabled = false,
	tone = 'plain',
	size = 'md',
}: {
	icon: IconName;
	/** The accessible name, and the tooltip text. Always both. */
	label: string;
	onClick: () => void;
	disabled?: boolean;
	tone?: IconButtonTone;
	size?: 'sm' | 'md';
}) {
	const box = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9';

	return (
		<span className="group relative inline-flex">
			<button
				type="button"
				onClick={onClick}
				disabled={disabled}
				aria-label={label}
				className={`inline-flex ${box} items-center justify-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none ${TONES[tone]}`}
			>
				<Icon name={icon} className={size === 'sm' ? 'h-4 w-4' : 'h-[1.125rem] w-[1.125rem]'} />
			</button>

			{/* No `role="tooltip"`: the accessible name already carries these words,
			    and a tooltip role on a hidden element only invites a second reading
			    of the same string. This element is here for eyes. */}
			<span
				aria-hidden="true"
				className="pointer-events-none absolute top-full left-1/2 z-50 mt-1.5 -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none dark:bg-slate-200 dark:text-ink"
			>
				{label}
			</span>
		</span>
	);
}
