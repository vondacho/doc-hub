/**
 * The board's colours as an exported picture has to spell them.
 *
 * The wall on screen gets its colours from Tailwind classes and the custom
 * properties in src/styles/global.css. A file that leaves this tab cannot: an
 * `.svg` opened in Inkscape, dropped into Figma or pasted into a slide has no
 * stylesheet behind it, so every colour has to be written into the document
 * itself, in a notation that everything downstream understands.
 *
 * ## Read, not copied
 *
 * The eleven kinds — twenty-two values with their edges, and forty-four across
 * both themes — are read off `:root` at export time rather than restated here.
 * A second copy of the notation's colours is a copy that drifts, and the drift
 * would be invisible: the wall would stay right and only the exported pictures
 * would slowly stop matching it, which is the failure nobody notices until
 * somebody puts a screenshot beside an export in the same deck.
 *
 * So global.css stays the one place the notation's colours are written down,
 * and this reads it. `getComputedStyle(document.documentElement)` sees the
 * custom properties Tailwind's `@theme` emits on `:root`, under exactly the
 * names global.css gives them.
 *
 * ## And converted, because oklch is not portable enough yet
 *
 * The tokens are `oklch(…)`, which is the right thing in a stylesheet and the
 * wrong thing in a file destined for other people's tools. Chrome and Firefox
 * render it; a good deal of what an `.svg` gets opened in does not, and the
 * failure mode is not a fallback colour but a black shape or a dropped fill.
 * Worse, the PNG path goes through `<img>` and a canvas, which is a rendering
 * context we do not control.
 *
 * So every value is converted to a `#rrggbb` — the one colour notation with no
 * support question attached. The conversion is the standard OKLCh → OKLab → LMS
 * → linear sRGB → sRGB chain, written out below; anything that is not an
 * `oklch(…)` is passed through untouched, so the day a token is written as a
 * hex or a `color-mix` this stops converting rather than starts guessing.
 *
 * Out-of-gamut colours are clamped per channel. That is not strictly correct —
 * proper gamut mapping preserves hue by reducing chroma — but every value in
 * global.css is inside sRGB by construction, and a clamp that never fires is
 * cheaper than a mapper that has to be trusted.
 */

import { CARD_KINDS, type CardKind } from '../eventstorm/model.ts';

/** One kind, as two colours: the paper and the line around it. */
export interface Swatch {
	readonly fill: string;
	readonly edge: string;
}

/**
 * Everything a drawing of this wall needs, resolved to sRGB.
 *
 * The furniture is here as well as the notation, because a picture needs a
 * ground to sit on and the ground decides whether the ink is legible. Exporting
 * cards without the background they were designed against produces black text
 * on transparency, which looks correct in a viewer with a white canvas and
 * unreadable in one with a dark canvas.
 */
export interface Palette {
	readonly kinds: Record<CardKind, Swatch>;
	/** The page the wall is drawn on. Never transparent — see above. */
	readonly ground: string;
	/** The lane rail and the header band: a step off the ground. */
	readonly raised: string;
	readonly ink: string;
	readonly inkMuted: string;
	/** The dashed square outlines. The ruling on the paper. */
	readonly rule: string;
}

/**
 * The palette for one theme, read out of the live stylesheet.
 *
 * `dark` rather than "read whatever the board is showing", because the board's
 * theme is a fact the caller already has — see `boardIsDark` in
 * EventStormBoard — and because the two themes' tokens both live on `:root` at
 * once. There is no element to interrogate for the night colours; they are
 * simply the `-night` suffixed names.
 */
export function palette(dark: boolean): Palette {
	const root = typeof document === 'undefined' ? null : document.documentElement;
	const read = (name: string, fallback: string): string => {
		if (root === null) return fallback;
		const value = getComputedStyle(root).getPropertyValue(name).trim();
		return value === '' ? fallback : toHex(value);
	};

	const suffix = dark ? '-night' : '';
	const kinds = {} as Record<CardKind, Swatch>;
	for (const kind of CARD_KINDS) {
		kinds[kind] = {
			fill: read(`--color-${kind}${suffix}`, dark ? '#333333' : '#eeeeee'),
			edge: read(`--color-${kind}${suffix}-edge`, dark ? '#666666' : '#999999'),
		};
	}

	return {
		kinds,
		ground: dark ? read('--color-night', '#14171f') : '#ffffff',
		raised: dark ? read('--color-night-raised', '#1f232c') : '#f8fafc',
		ink: dark ? '#e2e8f0' : read('--color-ink', '#1e293b'),
		inkMuted: dark ? '#94a3b8' : read('--color-ink-muted', '#64748b'),
		rule: dark ? '#64748b' : '#94a3b8',
	};
}

/**
 * `oklch(L C H)` to `#rrggbb`. Anything else through unchanged.
 *
 * The alpha form `oklch(L C H / a)` is accepted and its alpha dropped: nothing
 * in the notation uses one, and a picture is not the place to discover that a
 * card is half transparent over a ground that is not there.
 */
export function toHex(value: string): string {
	const match = /^oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)(?:deg)?\s*(?:\/.*)?\)$/i.exec(value);
	if (match === null) return value;

	const [, rawL, rawC, rawH] = match;
	const L = rawL!.endsWith('%') ? Number.parseFloat(rawL!) / 100 : Number.parseFloat(rawL!);
	// Chroma may be written as a percentage, where 100% is 0.4 by definition.
	const C = rawC!.endsWith('%') ? (Number.parseFloat(rawC!) / 100) * 0.4 : Number.parseFloat(rawC!);
	const H = (Number.parseFloat(rawH!) * Math.PI) / 180;
	if (!Number.isFinite(L) || !Number.isFinite(C) || !Number.isFinite(H)) return value;

	const a = C * Math.cos(H);
	const b = C * Math.sin(H);

	// OKLab to the cone responses, cubed back out of the perceptual space.
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

	const linear = [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	];

	return `#${linear.map(channel).join('')}`;
}

/** One linear-light channel, gamma-encoded and clamped, as two hex digits. */
function channel(value: number): string {
	const encoded = value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
	const byte = Math.round(Math.min(1, Math.max(0, encoded)) * 255);
	return byte.toString(16).padStart(2, '0');
}
