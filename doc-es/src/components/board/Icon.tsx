/**
 * One glyph from src/lib/board/icons.ts.
 *
 * Always `aria-hidden`: an icon in doc-sm never carries the accessible name on
 * its own. Whatever wraps it — IconButton, a menu item, a legend row — supplies
 * that. Marking it hidden here rather than at each call site means there is no
 * call site that can forget.
 *
 * The attribute values match doc-portal's inline SVGs exactly (1.6 stroke, round
 * caps and joins), so an icon here and an icon there sit at the same weight.
 */

import { icons, type IconName } from '../../lib/board/icons.ts';

export function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.6"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			className={className}
		>
			<path d={icons[name]} />
		</svg>
	);
}
