/**
 * The map as a picture: one standalone SVG, and the PNG raster of it.
 *
 * ## Drawn from the model, not scraped from the page
 *
 * The obvious way to export a picture of a board is to serialise the DOM that
 * is already on screen. It is also wrong here, for three reasons that all bite
 * at once. The rendered map is sized in `em` against a zoom stop, so the file
 * would come out at whatever magnification somebody happened to be at. It is
 * clipped by a scroller, so a map wider than the pane would be exported
 * cropped — silently, and only for the people whose window is narrow. And it
 * carries the furniture: drop targets, add-a-step affordances, carets,
 * tooltips, the empty column that exists so an activity always has somewhere to
 * grow.
 *
 * So this lays the map out again, from `BoardState`, at a fixed scale, with
 * none of that. What it draws is the plan; what BoardGrid draws is the plan
 * plus the means of editing it.
 *
 * ## The layout is the argument
 *
 * Three things have to survive into a picture or it stops being a story map and
 * becomes a table of cards.
 *
 * **The backbone spans.** An activity's header runs across all of its steps, so
 * the top row reads left to right as a narrative and you can see which stretch
 * of it each step belongs to. An activity drawn as one cell above one step
 * would be a two-row list.
 *
 * **The bands are rows, and the line is visible.** Each delivery is a row
 * across the whole width; unscheduled is the last one. The whole value of a
 * story map is that you can draw a line across it and ship what is above — so
 * the picture draws the bands as bands, names each one down the rail, and
 * leaves the below-the-line row visibly last rather than hiding it.
 *
 * **A cell that is empty stays empty.** The gap where an activity has nothing
 * in the first delivery is the finding: a slice that ships three whole
 * activities and none of the fourth is a plan to ship a product that stops
 * working halfway through the job. Collapsing empty cells would erase exactly
 * the thing somebody exports this to show a stakeholder.
 *
 * ## Nothing is clamped
 *
 * BoardGrid clamps card text so the grid stays a grid. Here the heights are
 * computed before anything is drawn, so a long story makes its whole row taller
 * and the columns stay in register — which means the picture can afford to be
 * lossless, and it is: full titles, the notes that sit behind the caret on
 * screen, the tags, the ticket and the status.
 *
 * ## The kind is written on the card
 *
 * The board on screen never uses colour as the only signal — every card carries
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
 * biased *generous* — a line estimated slightly too long wraps early, which
 * reads as a loose paragraph, where the opposite reads as text running out of
 * its card.
 */

import { storyStatusLabel, type StoryStatus } from '../storymap/model.ts';
import { kindLabel } from './kinds.ts';
import {
	bandOrder,
	columnGeometry,
	storiesIn,
	UNASSIGNED,
	type BandId,
	type BoardState,
	type CardKind,
	type Id,
} from './state.ts';
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
/** The band rail down the left, as in BoardGrid — a name and its notes. */
const RAIL = 176;
const COLUMN = 190;
/** Between columns and between rows. */
const GAP = 10;
/** Inside a cell, around the stack of stories. */
const CELL_PAD = 7;
const CARD_GAP = 6;
/** Inside a card, around its text. */
const CARD_PAD = 10;

/** A cell, at rest. Below this an empty band row stops reading as a row. */
const MIN_CELL = 72;
const MIN_CARD = 56;

const KIND_SIZE = 8;
const KIND_LEAD = 12;
const TITLE_SIZE = 13;
const TITLE_LEAD = 17;
const NOTE_SIZE = 11;
const NOTE_LEAD = 15;
const META_SIZE = 10;
const META_LEAD = 14;
const TAG_LEAD = 18;
const TAG_SIZE = 10;

/**
 * Average advance width as a fraction of font size, per weight.
 *
 * Two numbers rather than one because the semibold face is measurably wider,
 * and the titles — the strings most likely to be long enough to wrap — are the
 * ones set in it. A third, wider still, for the tag pills: those are one or two
 * words with none of the narrow letters a sentence average is built on, and a
 * pill is the one place a short estimate is *visible*, because the text is
 * drawn over a capsule sized from the same number.
 */
const ADVANCE_BOLD = 0.545;
const ADVANCE_PLAIN = 0.505;
const ADVANCE_TAG = 0.58;

export interface PictureOptions {
	/**
	 * The cards to draw, or `null` for all of them.
	 *
	 * The board's own `matching` set — see `filtered` in state.ts, which is what
	 * the tag row folds into. On screen a filtered-out card is *dimmed*, because
	 * the board has to keep showing you where the rest of the map is. A picture
	 * is not being navigated, so here it is left out entirely: a page of greyed
	 * rectangles is not a thing anybody wants in a document, and the caption in
	 * the export dialog says what was dropped.
	 *
	 * It matches activities, steps and stories alike. An activity the filter
	 * turns down keeps its column — the backbone is the map's structure, not one
	 * of its findings — and only its header goes quiet.
	 */
	readonly only: ReadonlySet<Id> | null;
	/** The theme the board is showing. The picture is what you are looking at. */
	readonly dark: boolean;
}

/**
 * A drawn map: the markup, and the size it came out at.
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

/** The whole map, as one self-contained SVG document. */
export function boardSvg(board: BoardState, options: PictureOptions): Picture {
	const paint = palette(options.dark);
	const shown = (id: Id) => options.only === null || options.only.has(id);
	const geometry = columnGeometry(board);
	const columns = geometry.columnCount;

	// Every card measured before anything is placed: a row is as tall as its
	// tallest cell, and a cell as tall as the stack in it.
	const cards = new Map<Id, Measured>();
	for (const [id, activity] of Object.entries(board.activities)) {
		cards.set(id, measure('activity', activity.title, activity.notes, activity.tags, activity.ticket, activity.status, activity.personas));
	}
	for (const [id, step] of Object.entries(board.steps)) {
		cards.set(id, measure('step', step.title, step.notes, step.tags, step.ticket, step.status, []));
	}
	for (const [id, story] of Object.entries(board.stories)) {
		cards.set(id, measure('story', story.title, story.notes, story.tags, story.ticket, story.status, [], story));
	}

	const backboneHeight = Math.max(
		MIN_CELL,
		...board.activityOrder.map((id) => (shown(id) ? (cards.get(id)?.height ?? MIN_CARD) : MIN_CARD) + CELL_PAD * 2),
	);
	const stepHeight = Math.max(
		MIN_CELL,
		...Object.keys(board.steps).map((id) => (shown(id) ? (cards.get(id)?.height ?? MIN_CARD) : MIN_CARD) + CELL_PAD * 2),
	);

	const bands = bandOrder(board);
	const rows = bands.map((band) => {
		let tallest = MIN_CELL;
		for (const stepId of geometry.columnOfStep.keys()) {
			const stack = storiesIn(board, stepId, band).filter(shown);
			if (stack.length === 0) continue;
			const height =
				CELL_PAD * 2 +
				stack.reduce((total, id) => total + (cards.get(id)?.height ?? MIN_CARD), 0) +
				CARD_GAP * (stack.length - 1);
			if (height > tallest) tallest = height;
		}
		return { band, height: Math.max(tallest, railHeight(board, band)) };
	});

	const head = header(board, paint);
	const legendHeight = 18 + 20;

	const width = PAD * 2 + RAIL + GAP + columns * COLUMN + (columns - 1) * GAP;
	const gridTop = PAD + head.height;
	const bodyHeight =
		backboneHeight + GAP + stepHeight + GAP + rows.reduce((total, row) => total + row.height + GAP, 0);
	const height = gridTop + bodyHeight + legendHeight + PAD;

	const out: string[] = [];
	out.push(
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${escape(FONT)}">`,
	);
	// A real ground, never transparency. Ink chosen against a dark page and
	// composited over whatever a viewer happens to use is ink nobody can read.
	out.push(`<rect width="${width}" height="${height}" fill="${paint.ground}"/>`);
	out.push(head.markup);

	const columnX = (column: number) => PAD + RAIL + GAP + column * (COLUMN + GAP);
	let y = gridTop;

	/*
	 * The backbone, spanning.
	 *
	 * An activity's header is drawn across the full width of its steps rather
	 * than over the first of them. That span *is* the claim the row makes — this
	 * stretch of the narrative is one activity — and a picture that drew it as a
	 * single cell would be exporting a different map from the one on screen.
	 */
	out.push(label(PAD, y, RAIL, backboneHeight, 'BACKBONE', paint));
	for (const activityId of board.activityOrder) {
		const span = geometry.spans.get(activityId);
		const measured = cards.get(activityId);
		if (!span || !measured) continue;
		const x = columnX(span.start);
		const spanWidth = span.width * COLUMN + (span.width - 1) * GAP;
		out.push(
			card('activity', measured, x + CELL_PAD, y + CELL_PAD, spanWidth - CELL_PAD * 2, paint, shown(activityId)),
		);
	}
	y += backboneHeight + GAP;

	// The steps, one per column, under the activity they belong to.
	out.push(label(PAD, y, RAIL, stepHeight, 'STEPS', paint));
	for (const [stepId, column] of geometry.columnOfStep) {
		const measured = cards.get(stepId);
		if (!measured) continue;
		out.push(
			card('step', measured, columnX(column) + CELL_PAD, y + CELL_PAD, COLUMN - CELL_PAD * 2, paint, shown(stepId)),
		);
	}
	y += stepHeight + GAP;

	// The bands. Each is a row across the whole width, named down the rail.
	for (const row of rows) {
		out.push(rail(board, row.band, PAD, y, row.height, paint));

		for (let column = 0; column < columns; column += 1) {
			const x = columnX(column);
			out.push(
				`<rect x="${x}" y="${y}" width="${COLUMN}" height="${row.height}" rx="5" fill="none" stroke="${paint.rule}" stroke-width="1" stroke-dasharray="4 3"/>`,
			);
		}

		for (const [stepId, column] of geometry.columnOfStep) {
			let cardY = y + CELL_PAD;
			for (const id of storiesIn(board, stepId, row.band).filter(shown)) {
				const measured = cards.get(id);
				if (!measured) continue;
				out.push(card('story', measured, columnX(column) + CELL_PAD, cardY, COLUMN - CELL_PAD * 2, paint, true));
				cardY += measured.height + CARD_GAP;
			}
		}

		y += row.height + GAP;
	}

	out.push(legend(PAD, y + 6, paint));
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
 */
export async function svgToPng(picture: Picture, scale = 2): Promise<Blob> {
	const width = picture.width * scale;
	const height = picture.height * scale;

	const image = new Image();
	// Base64 of the UTF-8 bytes, built in chunks. `btoa` only takes latin-1, so
	// a map written in any other script throws without the encode — titles are
	// free text, so that is not hypothetical — and spreading the whole byte array
	// into `String.fromCharCode` overflows the argument stack on a large map,
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
	readonly meta: string | null;
	readonly need: readonly string[];
	readonly notes: readonly string[];
	readonly tags: readonly string[];
}

/**
 * One card's height, and the lines it will be drawn as.
 *
 * Measured against the *narrow* column width even for a spanning activity
 * header. The alternative is to measure each activity against its own span,
 * which produces a backbone whose one-step activities wrap and whose four-step
 * ones do not — a row of cards set at four different apparent sizes, which
 * reads as a rendering fault rather than as a span. Wrapping every title to one
 * width keeps the row even, and a wide header simply has room to spare.
 */
function measure(
	kind: CardKind,
	title: string,
	notes: readonly string[],
	tags: readonly string[],
	ticket: string | null,
	status: StoryStatus,
	personas: readonly string[],
	story?: { persona: string | null; want: string | null; soThat: string | null },
): Measured {
	const inner = COLUMN - CELL_PAD * 2 - CARD_PAD * 2;
	const titleLines = wrap(title, inner, TITLE_SIZE, ADVANCE_BOLD);

	/*
	 * The ticket and the status, on one line, and only when they say something.
	 *
	 * `~open` on an unlinked card is the local placeholder for "nothing has been
	 * said about this yet" — printing it on every card would put a status on a
	 * board where nobody has set one, which is a picture claiming more than the
	 * file does.
	 */
	const meta = [ticket, status === 'open' && ticket === null ? null : storyStatusLabel[status]]
		.filter((part): part is string => part !== null)
		.join('  ·  ');

	/*
	 * The need, spelled out rather than summarised.
	 *
	 * `so` is the line that decides whether a story is worth building — it is the
	 * first thing the doctrine tells a reader to check — so a picture that
	 * dropped it would be dropping the half of the card the map is read for.
	 */
	const need = story
		? [
				story.persona === null ? null : `As ${story.persona}`,
				story.want === null ? null : `I want ${story.want}`,
				story.soThat === null ? null : `so that ${story.soThat}`,
			]
				.filter((line): line is string => line !== null)
				.flatMap((line) => wrap(line, inner, NOTE_SIZE, ADVANCE_PLAIN))
		: personas.flatMap((persona) => wrap(`For ${persona}`, inner, NOTE_SIZE, ADVANCE_PLAIN));

	const noteLines = notes.flatMap((note) =>
		note.split('\n').flatMap((line) => wrap(line, inner, NOTE_SIZE, ADVANCE_PLAIN)),
	);

	const height =
		CARD_PAD * 2 +
		KIND_LEAD +
		titleLines.length * TITLE_LEAD +
		(meta === '' ? 0 : 4 + META_LEAD) +
		(need.length > 0 ? 5 + need.length * NOTE_LEAD : 0) +
		(noteLines.length > 0 ? 5 + noteLines.length * NOTE_LEAD : 0) +
		(tags.length > 0 ? 5 + TAG_LEAD : 0);

	return {
		height: Math.max(MIN_CARD, height),
		kind: kindLabel[kind],
		title: titleLines,
		meta: meta === '' ? null : meta,
		need,
		notes: noteLines,
		tags,
	};
}

/**
 * One card.
 *
 * `lit` is false for a card the filter turned down but whose place the map
 * still needs — an activity, or a step under it. Those are drawn at reduced
 * opacity rather than omitted, which is the one place this picture keeps the
 * board's dimming: a backbone with a hole in it is not a backbone, and removing
 * a column would move every card to the right of it into a different moment.
 */
function card(
	kind: CardKind,
	measured: Measured,
	x: number,
	y: number,
	width: number,
	paint: Palette,
	lit: boolean,
): string {
	const swatch = paint.kinds[kind];
	const fade = lit ? '' : ' opacity="0.35"';
	const out: string[] = [
		`<g${fade}>`,
		`<rect x="${x}" y="${y}" width="${round(width)}" height="${measured.height}" rx="4" fill="${swatch.fill}" stroke="${swatch.edge}" stroke-width="1.25"/>`,
	];

	/*
	 * `top` is the top of the next block, never a baseline.
	 *
	 * The two are easy to confuse and the confusion is expensive: a cursor that
	 * sometimes means one and sometimes the other produces a card whose text
	 * drifts a few pixels lower with every optional block above it, which looks
	 * like nothing on a bare card and like a bug on a full one.
	 */
	let top = y + CARD_PAD;

	out.push(
		text(x + CARD_PAD, top + 8, measured.kind.toUpperCase(), {
			size: KIND_SIZE,
			fill: paint.ink,
			opacity: 0.55,
			weight: 600,
			spacing: 0.6,
		}),
	);
	top += KIND_LEAD;

	for (const line of measured.title) {
		out.push(text(x + CARD_PAD, top + 12, line, { size: TITLE_SIZE, fill: paint.ink, weight: 600 }));
		top += TITLE_LEAD;
	}

	if (measured.meta !== null) {
		top += 4;
		out.push(
			text(x + CARD_PAD, top + 10, measured.meta, {
				size: META_SIZE,
				fill: paint.ink,
				opacity: 0.7,
				weight: 600,
			}),
		);
		top += META_LEAD;
	}

	if (measured.need.length > 0) {
		top += 5;
		for (const line of measured.need) {
			out.push(text(x + CARD_PAD, top + 11, line, { size: NOTE_SIZE, fill: paint.ink, opacity: 0.8 }));
			top += NOTE_LEAD;
		}
	}

	if (measured.notes.length > 0) {
		top += 5;
		for (const line of measured.notes) {
			out.push(text(x + CARD_PAD, top + 11, line, { size: NOTE_SIZE, fill: paint.ink, opacity: 0.68 }));
			top += NOTE_LEAD;
		}
	}

	if (measured.tags.length > 0) {
		top += 5;
		let tagX = x + CARD_PAD;
		for (const tag of measured.tags) {
			const pill = round(tag.length * TAG_SIZE * ADVANCE_TAG + 14);
			// A tag that would run off the card is dropped rather than clipped:
			// half a word in a capsule reads as a rendering fault, and the outline
			// export carries every tag in full.
			if (tagX + pill > x + width - CARD_PAD) break;
			out.push(
				`<rect x="${round(tagX)}" y="${top + 2}" width="${pill}" height="14" rx="7" fill="${paint.ground}" fill-opacity="0.5" stroke="${paint.inkMuted}" stroke-width="0.75"/>`,
			);
			out.push(text(tagX + 6, top + 12, tag, { size: TAG_SIZE, fill: paint.ink, opacity: 0.8 }));
			tagX += pill + 4;
		}
	}

	out.push('</g>');
	return out.join('');
}

/** How tall the rail's own text needs this band's row to be. */
function railHeight(board: BoardState, band: BandId): number {
	const inner = RAIL - CELL_PAD * 2;
	const delivery = band === UNASSIGNED ? null : board.deliveries[band];
	const title = delivery?.title ?? 'Not scheduled';
	const notes = delivery?.notes ?? [];
	return (
		CELL_PAD * 2 +
		20 +
		TITLE_LEAD * wrap(title, inner, TITLE_SIZE, ADVANCE_BOLD).length +
		(notes.length > 0
			? 6 + NOTE_LEAD * notes.flatMap((n) => wrap(n, inner, NOTE_SIZE, ADVANCE_PLAIN)).length
			: 0)
	);
}

/**
 * One band's name down the left.
 *
 * The unassigned row is named rather than left blank, and its caption says what
 * it means. Unscheduled stories are not a backlog to be tidied away — they are
 * the map saying what the plan currently leaves out — and a nameless row at the
 * bottom of a picture reads as leftovers.
 */
function rail(board: BoardState, band: BandId, x: number, y: number, height: number, paint: Palette): string {
	const inner = RAIL - CELL_PAD * 2;
	const delivery = band === UNASSIGNED ? null : board.deliveries[band];
	const kind = delivery === null ? 'BELOW THE LINE' : delivery.kind.toUpperCase();
	const title = delivery?.title ?? 'Not scheduled';

	const out: string[] = [
		`<rect x="${x}" y="${y}" width="${RAIL}" height="${height}" rx="5" fill="${paint.raised}" stroke="${paint.rule}" stroke-width="1" stroke-opacity="0.6"/>`,
	];

	let top = y + CELL_PAD;
	out.push(
		text(x + CELL_PAD, top + 8, kind, { size: KIND_SIZE, fill: paint.inkMuted, weight: 600, spacing: 0.6 }),
	);
	top += KIND_LEAD;

	for (const line of wrap(title, inner, TITLE_SIZE, ADVANCE_BOLD)) {
		out.push(text(x + CELL_PAD, top + 12, line, { size: TITLE_SIZE, fill: paint.ink, weight: 700 }));
		top += TITLE_LEAD;
	}

	if (delivery?.ticket) {
		out.push(text(x + CELL_PAD, top + 10, delivery.ticket, { size: META_SIZE, fill: paint.inkMuted }));
		top += META_LEAD;
	}

	for (const line of (delivery?.notes ?? []).flatMap((n) => wrap(n, inner, NOTE_SIZE, ADVANCE_PLAIN))) {
		out.push(text(x + CELL_PAD, top + 11, line, { size: NOTE_SIZE, fill: paint.inkMuted }));
		top += NOTE_LEAD;
	}

	return out.join('');
}

/** A caption down the rail beside the two backbone rows. */
function label(x: number, y: number, width: number, height: number, caption: string, paint: Palette): string {
	return (
		`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="5" fill="${paint.raised}" stroke="${paint.rule}" stroke-width="1" stroke-opacity="0.6"/>` +
		text(x + CELL_PAD, y + CELL_PAD + 8, caption, {
			size: KIND_SIZE,
			fill: paint.inkMuted,
			weight: 600,
			spacing: 0.6,
		})
	);
}

function header(board: BoardState, paint: Palette): { markup: string; height: number } {
	const out: string[] = [text(PAD, PAD + 20, board.title, { size: 20, fill: paint.ink, weight: 700 })];
	const caption = [board.product, board.space].filter((part): part is string => part !== null && part !== '');
	out.push(text(PAD, PAD + 40, caption.join('  ·  '), { size: 11, fill: paint.inkMuted, spacing: 0.4 }));
	return { markup: out.join(''), height: 56 };
}

function legend(x: number, y: number, paint: Palette): string {
	const out: string[] = [
		text(x, y + 10, 'THE THREE KINDS', { size: 9, fill: paint.inkMuted, weight: 600, spacing: 0.8 }),
	];
	(['activity', 'step', 'story'] as const).forEach((kind, index) => {
		const entryX = x + index * 190;
		const entryY = y + 26;
		const swatch = paint.kinds[kind];
		out.push(
			`<rect x="${entryX}" y="${entryY - 9}" width="12" height="12" rx="2.5" fill="${swatch.fill}" stroke="${swatch.edge}" stroke-width="1"/>`,
		);
		out.push(text(entryX + 18, entryY + 1, kindLabel[kind], { size: 11, fill: paint.ink }));
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
