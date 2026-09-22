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
 *
 * ## One of them is filled
 *
 * The brand marks — `github`, and nothing else so far — are silhouettes rather
 * than drawings, so they are painted in `currentColor` and not stroked at all.
 * The list lives in icons.ts beside the paths, because which way a glyph is
 * drawn is a fact about the glyph; this component only has to read it. Either
 * way the colour comes from the text around it, which is what keeps a single
 * `<Icon>` usable in both themes and at both sizes.
 *
 * They are also inset, which is the part that is easy to miss. Every glyph
 * written here sits in about a 20-unit field on the 24-unit grid — the stroked
 * shapes start at 3 or 4 and end at 20 or 21 — and a logo drawn edge to edge
 * would be the largest thing in the toolbar by a fifth while claiming to be the
 * same size as its neighbours. The transform puts it in the same field. It is
 * optical alignment, not a correction of the path: the mark is somebody else's
 * and is left exactly as they draw it.
 */

import { icons, FILLED, type IconName } from '../../lib/board/icons.ts';

export function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
	const filled = FILLED.has(name);

	return (
		<svg
			viewBox="0 0 24 24"
			fill={filled ? 'currentColor' : 'none'}
			stroke={filled ? 'none' : 'currentColor'}
			strokeWidth="1.6"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			className={className}
		>
			{filled ? (
				<g transform="translate(2 2) scale(0.8333)">
					<path d={icons[name]} />
				</g>
			) : (
				<path d={icons[name]} />
			)}
		</svg>
	);
}
