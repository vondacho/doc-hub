/**
 * The wall as a picture: one standalone SVG, and the PNG raster of it.
 *
 * ## Drawn from the model, not scraped from the page
 *
 * The obvious way to export a picture of a board is to serialise the DOM that
 * is already on screen. It is also wrong here, for three reasons that all bite
 * at once. The rendered wall is sized in `em` against a zoom stop, so the file
 * would come out at whatever magnification somebody happened to be at. It is
 * clipped by a scroller, so a wall wider than the pane would be exported
 * cropped — silently, and only for the people whose window is narrow. And it
 * carries the furniture: drop targets, `+` strips, carets, tooltips, the empty
 * column that exists so there is always one more square to place a note on.
 *
 * So this lays the wall out again, from `BoardState`, at a fixed scale, with
 * none of that. What it draws is the storm; what BoardGrid draws is the storm
 * plus the means of editing it. They agree on the arrangement — lanes down,
 * time across, notes stacked within a square — because that arrangement *is*
 * the notation, and they disagree about everything that only exists to be
 * clicked.
 *
 * ## Nothing is clamped
 *
 * BoardGrid clamps a note's title to four lines. That is a grid rule, not a
 * document rule: a note that grew to fit its words would push its neighbours
 * out of alignment, and the whole point of the horizontal axis is that column 4
 * is the same moment in every lane.
 *
 * Here the heights are computed before anything is drawn, so a tall note makes
 * its whole row taller and the columns stay in register. That means the picture
 * can afford to be lossless, and it is: full titles, the notes that sit behind
 * the caret on screen, and the tags. An archived picture that had quietly
 * dropped the words somebody wrote would be worse than no picture.
 *
 * ## The kind is written on the card
 *
 * The wall on screen never uses colour as the only signal — every note carries
 * its kind in its accessible name, and the legend is a keystroke away. An
 * exported file has neither, so each card is labelled with its kind, and the
 * kinds in use are listed along the bottom. Same rule, different medium.
 *
 * ## Text is measured by estimate
 *
 * There is no text metric here: SVG has no layout engine to ask, and measuring
 * through a canvas would tie the geometry to whatever font that context ends up
 * resolving. Line breaking uses an average advance width per point of font
 * size, which is accurate to a few percent for the system sans stack and is
 * biased *generous* — a line that is estimated slightly too long wraps early,
 * which reads as a loose paragraph, where the opposite reads as text running
 * out of its card.
 */

import { CARD_KINDS, cardLabel, levelLabel, type CardKind, type Level } from '../eventstorm/model.ts';
import { cardsAt, lastColumn, type BoardState, type Id } from './state.ts';
import { palette, type Palette } from './palette.ts';

/**
 * The font stack the picture asks for, in both of its lives.
 *
 * Generic families only. The standalone `.svg` is opened in tools that have no
 * access to a webfont, and the PNG path renders the same markup inside an
 * `<img>`, which is a context with no stylesheet and no font loading at all. A
 * named webfont here would resolve in the app and silently fall back to
 * something else in every file anybody actually keeps.
 */
const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/** Everything the drawing is measured in. One place, so the picture stays in proportion. */
const PAD = 32;
/** The lane rail down the left, as in BoardGrid — a name and the notes under it. */
const RAIL = 176;
const COLUMN = 176;
/** Between squares. The dashed outlines must not touch or they read as a table. */
const GAP = 10;
/** Inside a square, around the stack of notes. */
const CELL_PAD = 7;
/** Between two notes on the same square. */
const NOTE_GAP = 6;
/** Inside a note, around its text. */
const NOTE_PAD = 10;
/** The column ruler across the top. */
const RULER = 22;

/** A square, at rest. Below this the wall stops reading as a wall of stickies. */
const MIN_SQUARE = 128;
/** A note with four words on it. Squarish, like the paper it is a picture of. */
const MIN_NOTE = 86;

const KIND_SIZE = 8;
const KIND_LEAD = 12;
const TITLE_SIZE = 13;
const TITLE_LEAD = 17;
const NOTE_SIZE = 11;
const NOTE_LEAD = 15;
const TAG_SIZE = 10;
const TAG_LEAD = 18;
const LANE_SIZE = 14;
const LANE_LEAD = 18;

/**
 * Average advance width as a fraction of font size, per weight.
 *
 * Two numbers rather than one because the semibold face is measurably wider,
 * and the titles — the strings most likely to be long enough to wrap — are the
 * ones set in it. See the note at the top of this file on why these are
 * estimates and why they lean generous.
 */
const ADVANCE_BOLD = 0.545;
const ADVANCE_PLAIN = 0.505;
/*
 * And a third, wider, for the tag pills.
 *
 * The two above are averages over sentences, where the wide letters are paid
 * for by the `i`s and the spaces. A tag is one or two words and often has
 * neither, so the sentence average runs short — and a pill is the one place
 * where running short is *visible* rather than merely loose: the text is drawn
 * over a rounded rectangle sized from the same estimate, so a few percent of
 * error puts the last letter outside its own capsule.
 */
const ADVANCE_TAG = 0.58;

export interface PictureOptions {
	/**
	 * The cards to draw, or `null` for all of them.
	 *
	 * The board's own `matching` set — see `filtered` in state.ts — which is
	 * what the level lens and the tag row fold into. On screen a filtered-out
	 * note is *dimmed*, because the wall has to keep showing you where the rest
	 * of the storm is. A picture is not being navigated, so here it is left out
	 * entirely: a page of greyed rectangles is not a thing anybody wants to put
	 * in a document, and the caption in the export dialog says what was dropped.
	 *
	 * Lanes are never filtered. `filtered` only ever speaks about cards, and a
	 * lane with nothing left in it is a true statement about the filter.
	 */
	readonly only: ReadonlySet<Id> | null;
	/** The theme the board is showing. The picture is what you are looking at. */
	readonly dark: boolean;
	/**
	 * The level this picture's own cards reach, for the caption.
	 *
	 * Not the lens the board is set to — see `reaches` in the export catalogue,
	 * which is the one place that distinction is worked out.
	 */
	readonly level: Level;
}

/**
 * A drawn wall: the markup, and the size it came out at.
 *
 * The size is carried alongside rather than parsed back out of the markup. It
 * is known exactly at the moment the document is written, and the raster needs
 * it — recovering it with a regular expression over the finished string would
 * be re-deriving something we had, from a format where `width` appears on every
 * rectangle in the file.
 */
export interface Picture {
	readonly svg: string;
	readonly width: number;
	readonly height: number;
}

/** The whole wall, as one self-contained SVG document. */
export function boardSvg(board: BoardState, options: PictureOptions): Picture {
	const paint = palette(options.dark);
	const shown = (id: Id) => options.only === null || options.only.has(id);

	/*
	 * One column past the last note is BoardGrid's, and it does not belong here.
	 *
	 * The empty column exists so that the surface never runs out from under a
	 * workshop — reaching it creates the one after. That is an affordance of a
	 * thing you can place notes on, and a picture is not one. A trailing empty
	 * column in an exported file just reads as a margin somebody got wrong.
	 */
	const columns = Math.max(1, lastColumn(board));

	// Every note measured before anything is placed: a row is as tall as its
	// tallest square, and a square as tall as the stack on it.
	const notes = new Map<Id, Measured>();
	for (const [id, card] of Object.entries(board.cards)) {
		notes.set(id, measureNote(card.title, card.notes, card.tags, card.kind));
	}

	const rows = board.laneOrder.map((laneId) => {
		let tallest = MIN_SQUARE;
		for (let column = 1; column <= columns; column += 1) {
			const stack = cardsAt(board, laneId, column).filter(shown);
			if (stack.length === 0) continue;
			const height =
				CELL_PAD * 2 +
				stack.reduce((total, id) => total + (notes.get(id)?.height ?? MIN_NOTE), 0) +
				NOTE_GAP * (stack.length - 1);
			if (height > tallest) tallest = height;
		}
		const lane = board.lanes[laneId];
		// The rail carries the lane's own notes under its name, so a lane with a
		// paragraph on it can be taller than its busiest square.
		const rail =
			CELL_PAD * 2 +
			LANE_LEAD * wrap(lane?.title ?? '', RAIL - CELL_PAD * 2, LANE_SIZE, ADVANCE_BOLD).length +
			(lane?.notes.length
				? 6 + NOTE_LEAD * lane.notes.flatMap((n) => wrap(n, RAIL - CELL_PAD * 2, NOTE_SIZE, ADVANCE_PLAIN)).length
				: 0);
		return { laneId, height: Math.max(tallest, rail) };
	});

	const used = CARD_KINDS.filter((kind) =>
		Object.entries(board.cards).some(([id, card]) => card.kind === kind && shown(id)),
	);

	const head = header(board, options, paint);
	const legendRows = Math.ceil(used.length / legendPerRow(columns));
	const legendHeight = used.length === 0 ? 0 : 18 + legendRows * 20;

	const width = PAD * 2 + RAIL + GAP + columns * COLUMN + (columns - 1) * GAP;
	const gridTop = PAD + head.height + RULER;
	const gridHeight = rows.reduce((total, row) => total + row.height, 0) + Math.max(0, rows.length - 1) * GAP;
	const height = gridTop + gridHeight + legendHeight + PAD;

	const out: string[] = [];
	out.push(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${escape(FONT)}">`,
	);
	// A real ground, never transparency. Ink chosen against a dark page and
	// composited over whatever a viewer happens to use is ink nobody can read.
	out.push(`<rect width="${width}" height="${height}" fill="${paint.ground}"/>`);
	out.push(head.markup);

	// The ruler: which column is which, so two pictures of the same storm can be
	// talked about. Above the grid, as on screen.
	for (let column = 1; column <= columns; column += 1) {
		const x = PAD + RAIL + GAP + (column - 1) * (COLUMN + GAP);
		out.push(
			text(x + COLUMN / 2, gridTop - 7, String(column), {
				size: 10,
				fill: paint.inkMuted,
				anchor: 'middle',
			}),
		);
	}

	let y = gridTop;
	for (const row of rows) {
		const lane = board.lanes[row.laneId];
		out.push(rail(lane?.title ?? '', lane?.notes ?? [], PAD, y, row.height, paint));

		for (let column = 1; column <= columns; column += 1) {
			const x = PAD + RAIL + GAP + (column - 1) * (COLUMN + GAP);
			out.push(
				`<rect x="${x}" y="${y}" width="${COLUMN}" height="${row.height}" rx="5" fill="none" stroke="${paint.rule}" stroke-width="1" stroke-dasharray="4 3"/>`,
			);

			let noteY = y + CELL_PAD;
			for (const id of cardsAt(board, row.laneId, column).filter(shown)) {
				const card = board.cards[id];
				const measured = notes.get(id);
				if (!card || !measured) continue;
				out.push(note(card.kind, measured, x + CELL_PAD, noteY, paint));
				noteY += measured.height + NOTE_GAP;
			}
		}

		y += row.height + GAP;
	}

	if (used.length > 0) out.push(legend(used, PAD, y + 6, columns, paint));

	out.push('</svg>');
	return { svg: out.join('\n'), width, height };
}

/**
 * The same picture, rasterised.
 *
 * Through an `<img>` and a canvas rather than through any drawing code of its
 * own: two renderers for one picture would be two things to keep in step, and
 * the second one would be the one nobody looks at. The SVG is the drawing; PNG
 * is a photograph of it.
 *
 * At twice the nominal size, because the one thing a PNG is for here is being
 * pasted into a deck or a ticket, and both of those are read on displays where
 * a 1× raster of 13-point text looks like a fax.
 *
 * A data URL rather than an object URL. `URL.createObjectURL` would need
 * revoking on every path out of this function, including the rejections, and an
 * SVG small enough to be a board is small enough to inline.
 */
export async function svgToPng(picture: Picture, scale = 2): Promise<Blob> {
	const width = picture.width * scale;
	const height = picture.height * scale;

	const image = new Image();
	// Base64 of the UTF-8 bytes, built in chunks. `btoa` only takes latin-1, so
	// a storm written in any other script throws without the encode — titles are
	// free text, so that is not hypothetical — and spreading the whole byte array
	// into `String.fromCharCode` overflows the argument stack on a large wall,
	// which is a failure that only shows up on somebody's real board.
	const bytes = new TextEncoder().encode(picture.svg);
	let binary = '';
	for (let at = 0; at < bytes.length; at += 8192) {
		binary += String.fromCharCode(...bytes.subarray(at, at + 8192));
	}
	image.src = `data:image/svg+xml;base64,${btoa(binary)}`;

	await new Promise<void>((resolve, reject) => {
		image.onload = () => resolve();
		image.onerror = () => reject(new Error('The browser could not render the picture.'));
	});

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d');
	if (context === null) throw new Error('This browser has no 2D canvas to raster with.');
	context.drawImage(image, 0, 0, width, height);

	return await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (blob === null) reject(new Error('The browser produced no PNG.'));
			else resolve(blob);
		}, 'image/png');
	});
}

/* ---- the parts ---------------------------------------------------------- */

interface Measured {
	readonly height: number;
	readonly kind: string;
	readonly title: readonly string[];
	readonly notes: readonly string[];
	readonly tags: readonly string[];
}

function measureNote(
	title: string,
	notes: readonly string[],
	tags: readonly string[],
	kind: CardKind,
): Measured {
	const inner = COLUMN - CELL_PAD * 2 - NOTE_PAD * 2;
	const titleLines = wrap(title, inner, TITLE_SIZE, ADVANCE_BOLD);
	const noteLines = notes.flatMap((line) => wrap(line, inner, NOTE_SIZE, ADVANCE_PLAIN));

	const height =
		NOTE_PAD * 2 +
		KIND_LEAD +
		titleLines.length * TITLE_LEAD +
		(noteLines.length > 0 ? 5 + noteLines.length * NOTE_LEAD : 0) +
		(tags.length > 0 ? 5 + TAG_LEAD : 0);

	return {
		height: Math.max(MIN_NOTE, height),
		kind: cardLabel[kind],
		title: titleLines,
		notes: noteLines,
		tags,
	};
}

function note(kind: CardKind, measured: Measured, x: number, y: number, paint: Palette): string {
	const swatch = paint.kinds[kind];
	const width = COLUMN - CELL_PAD * 2;
	const out: string[] = [
		`<rect x="${x}" y="${y}" width="${width}" height="${measured.height}" rx="4" fill="${swatch.fill}" stroke="${swatch.edge}" stroke-width="1.25"/>`,
	];

	/*
	 * `top` is the top of the next block, never a baseline.
	 *
	 * The two are easy to confuse and the confusion is expensive: a cursor that
	 * sometimes means one and sometimes the other produces a note whose text
	 * drifts a few pixels lower with every optional block above it, which looks
	 * like nothing at all on a one-line card and like a bug on a full one. Every
	 * baseline below is written as `top + <the ascent for that size>`, and every
	 * advance is the block's own leading.
	 */
	let top = y + NOTE_PAD;

	// The kind, in small caps above the title. The only signal an exported file
	// has beyond the colour — see the note at the top of this file.
	out.push(
		text(x + NOTE_PAD, top + 8, measured.kind.toUpperCase(), {
			size: KIND_SIZE,
			fill: paint.ink,
			opacity: 0.55,
			weight: 600,
			spacing: 0.6,
		}),
	);
	top += KIND_LEAD;

	for (const line of measured.title) {
		out.push(text(x + NOTE_PAD, top + 12, line, { size: TITLE_SIZE, fill: paint.ink, weight: 600 }));
		top += TITLE_LEAD;
	}

	if (measured.notes.length > 0) {
		top += 5;
		for (const line of measured.notes) {
			out.push(text(x + NOTE_PAD, top + 11, line, { size: NOTE_SIZE, fill: paint.ink, opacity: 0.72 }));
			top += NOTE_LEAD;
		}
	}

	if (measured.tags.length > 0) {
		top += 5;
		let tagX = x + NOTE_PAD;
		for (const tag of measured.tags) {
			const pill = round(tag.length * TAG_SIZE * ADVANCE_TAG + 14);
			// A tag that would run off the note is dropped rather than clipped:
			// half a word in a coloured pill reads as a rendering fault, and the
			// outline export carries every tag in full.
			if (tagX + pill > x + width - NOTE_PAD) break;
			out.push(
				`<rect x="${round(tagX)}" y="${top + 2}" width="${pill}" height="14" rx="7" fill="${paint.ground}" fill-opacity="0.5" stroke="${paint.inkMuted}" stroke-width="0.75"/>`,
			);
			out.push(text(tagX + 6, top + 12, tag, { size: TAG_SIZE, fill: paint.ink, opacity: 0.8 }));
			tagX += pill + 4;
		}
	}

	return out.join('');
}

function rail(
	title: string,
	notes: readonly string[],
	x: number,
	y: number,
	height: number,
	paint: Palette,
): string {
	const inner = RAIL - CELL_PAD * 2;
	const out: string[] = [
		`<rect x="${x}" y="${y}" width="${RAIL}" height="${height}" rx="5" fill="${paint.raised}" stroke="${paint.rule}" stroke-width="1" stroke-opacity="0.6"/>`,
	];

	let cursor = y + CELL_PAD + 12;
	for (const line of wrap(title, inner, LANE_SIZE, ADVANCE_BOLD)) {
		out.push(text(x + CELL_PAD, cursor, line, { size: LANE_SIZE, fill: paint.ink, weight: 700 }));
		cursor += LANE_LEAD;
	}
	if (notes.length > 0) {
		cursor += 4;
		for (const line of notes.flatMap((n) => wrap(n, inner, NOTE_SIZE, ADVANCE_PLAIN))) {
			out.push(text(x + CELL_PAD, cursor, line, { size: NOTE_SIZE, fill: paint.inkMuted }));
			cursor += NOTE_LEAD;
		}
	}

	return out.join('');
}

/**
 * The board's name, and what it is a picture *of*.
 *
 * The lens belongs in the file rather than only in the dialog that produced it.
 * A big-picture view of a wall modelled all the way to software design is a
 * perfectly good picture and a misleading one to hand somebody with no caption:
 * they will read the absence of commands as a storm that has not got there yet.
 */
function header(board: BoardState, options: PictureOptions, paint: Palette): { markup: string; height: number } {
	const out: string[] = [
		text(PAD, PAD + 20, board.title, { size: 20, fill: paint.ink, weight: 700 }),
	];

	const caption = [
		board.product === null ? null : board.product,
		levelLabel[options.level],
		options.only === null ? null : 'filtered',
	].filter((part): part is string => part !== null);

	out.push(text(PAD, PAD + 40, caption.join('  ·  '), { size: 11, fill: paint.inkMuted, spacing: 0.4 }));
	return { markup: out.join(''), height: 56 };
}

/** How many legend entries fit across, given how wide the wall came out. */
function legendPerRow(columns: number): number {
	return Math.max(2, Math.floor((RAIL + GAP + columns * (COLUMN + GAP)) / 190));
}

function legend(kinds: readonly CardKind[], x: number, y: number, columns: number, paint: Palette): string {
	const perRow = legendPerRow(columns);
	const out: string[] = [
		text(x, y + 10, 'NOTATION ON THIS WALL', { size: 9, fill: paint.inkMuted, weight: 600, spacing: 0.8 }),
	];

	kinds.forEach((kind, index) => {
		const column = index % perRow;
		const row = Math.floor(index / perRow);
		const entryX = x + column * 190;
		const entryY = y + 26 + row * 20;
		const swatch = paint.kinds[kind];
		out.push(
			`<rect x="${entryX}" y="${entryY - 9}" width="12" height="12" rx="2.5" fill="${swatch.fill}" stroke="${swatch.edge}" stroke-width="1"/>`,
		);
		out.push(text(entryX + 18, entryY + 1, cardLabel[kind], { size: 11, fill: paint.ink }));
	});

	return out.join('');
}

/* ---- primitives --------------------------------------------------------- */

function text(
	x: number,
	y: number,
	value: string,
	style: {
		size: number;
		fill: string;
		weight?: number;
		anchor?: 'start' | 'middle';
		opacity?: number;
		spacing?: number;
	},
): string {
	if (value === '') return '';
	const attributes = [
		`x="${round(x)}"`,
		`y="${round(y)}"`,
		`font-size="${style.size}"`,
		`fill="${style.fill}"`,
		style.weight === undefined ? '' : `font-weight="${style.weight}"`,
		style.anchor === undefined ? '' : `text-anchor="${style.anchor}"`,
		style.opacity === undefined ? '' : `fill-opacity="${style.opacity}"`,
		style.spacing === undefined ? '' : `letter-spacing="${style.spacing}"`,
	].filter((part) => part !== '');
	return `<text ${attributes.join(' ')}>${escape(value)}</text>`;
}

/**
 * Greedy word wrap against an estimated advance width.
 *
 * A word longer than the line is broken rather than allowed to overhang — a URL
 * or a compound identifier in a title is uncommon and not impossible, and the
 * failure without this is text crossing into the next column, which looks like
 * the picture is broken rather than like the title is long.
 */
export function wrap(value: string, width: number, size: number, advance: number): readonly string[] {
	const trimmed = value.trim();
	if (trimmed === '') return [];
	const limit = Math.max(4, Math.floor(width / (size * advance)));

	const lines: string[] = [];
	let line = '';
	for (const word of trimmed.split(/\s+/)) {
		let rest = word;
		while (rest.length > limit) {
			if (line !== '') {
				lines.push(line);
				line = '';
			}
			lines.push(rest.slice(0, limit));
			rest = rest.slice(limit);
		}
		if (line === '') line = rest;
		else if (line.length + 1 + rest.length <= limit) line = `${line} ${rest}`;
		else {
			lines.push(line);
			line = rest;
		}
	}
	if (line !== '') lines.push(line);
	return lines;
}

/** Two decimals is well past what a renderer can show, and keeps the file small. */
function round(value: number): number {
	return Math.round(value * 100) / 100;
}

/**
 * XML-escape.
 *
 * `&` first, or every entity written by the later replacements is escaped a
 * second time and `&amp;` arrives as `&amp;amp;`. Apostrophes and quotes go too
 * because this function is used for attribute values as well as text nodes, and
 * a title with a quote in it would otherwise close the attribute and produce a
 * file no parser will open.
 */
function escape(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&apos;');
}
