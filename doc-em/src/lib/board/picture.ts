/**
 * The map as a picture: one standalone SVG, and the PNG raster of it.
 *
 * ## Drawn from the model, not scraped from the page
 *
 * The obvious way to export a picture of a board is to serialise the DOM that
 * is already on screen. It is also wrong here, for three reasons that all bite
 * at once. The rendered map is sized in `em` against a zoom stop, so the file
 * would come out at whatever magnification somebody happened to be at. It is
 * clipped by a scroller, so a map with more rules than the pane is wide would
 * be exported cropped — silently, and only for the people whose window is
 * narrow. And it carries the furniture: drop targets, add-a-card affordances,
 * carets, tooltips, menus.
 *
 * So this lays the map out again, from `BoardState`, at a fixed scale, with
 * none of that. What it draws is the session's findings; what BoardGrid draws
 * is the findings plus the means of editing them.
 *
 * ## The layout is the argument
 *
 * An example map is read for its *shape* before it is read for its words — many
 * red cards means the story is not ready, many blue means it is too big, a rule
 * with no green under it is a rule nobody understands yet. Three things have to
 * survive into the picture or that reading is lost.
 *
 * **The story spans the width.** There is one of it, everything else is about
 * it, and drawing it as one card in the first column would make it look like
 * the first rule.
 *
 * **A rule is a column, and its questions hang on it.** The red cards under a
 * rule's heading are not scheduled and are not examples — they are what the
 * room could not answer about that rule — so they sit in the header with it
 * rather than in any band.
 *
 * **An empty cell stays empty.** A rule with no examples is the first thing the
 * doctrine tells a reader to look for. Collapsing the gap would erase exactly
 * the finding somebody exports this to show.
 *
 * ## Nothing is clamped
 *
 * BoardGrid clamps card text so the grid stays a grid. Here the heights are
 * computed before anything is drawn, so a long example makes its whole row
 * taller and the columns stay in register — which means the picture can afford
 * to be lossless, and it is: full titles, the Given/When/Then behind the caret
 * on screen, the notes, and the tags.
 *
 * ## The kind is written on the card
 *
 * The board on screen never uses colour as the only signal — every card carries
 * its kind in its accessible name, and the legend is a keystroke away. An
 * exported file has neither, so each card is labelled with its kind, and the
 * four are listed along the bottom. Same rule, different medium.
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

import {
	cardLabel,
	CARD_KINDS,
	clauseKeyword,
	STEP_CLAUSES,
	storyStatusLabel,
	type CardKind,
} from '../examplemap/model.ts';
import {
	bands,
	examplesIn,
	UNSCHEDULED,
	type BandId,
	type BoardState,
	type Id,
} from './state.ts';
import { palette, type Palette } from './palette.ts';

/**
 * The font stack the picture asks for, in both of its lives.
 *
 * Generic families only. The standalone `.svg` is opened in tools that have no
 * access to a webfont, and the PNG path renders the same markup inside an
 * `<img>`, which is a context with no stylesheet and no font loading at all.
 */
const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/** Everything the drawing is measured in. One place, so the picture stays in proportion. */
const PAD = 32;
/** The band rail down the left — a name and its notes. */
const RAIL = 176;
const COLUMN = 210;
const GAP = 10;
const CELL_PAD = 7;
const CARD_GAP = 6;
const CARD_PAD = 10;

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
const TAG_SIZE = 10;
const TAG_LEAD = 18;

/**
 * Average advance width as a fraction of font size, per weight.
 *
 * Two numbers rather than one because the semibold face is measurably wider,
 * and the titles — the strings most likely to be long enough to wrap — are set
 * in it. A third, wider still, for the tag pills: those are one or two words
 * with none of the narrow letters a sentence average is built on, and a pill is
 * the one place a short estimate is *visible*, because the text is drawn over a
 * capsule sized from the same number.
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
	 * is not being navigated, so an example the filter turns down is left out
	 * entirely.
	 *
	 * A rule is not. A rule is the *heading of a column*, and a column whose
	 * heading vanished would move every rule to the right of it — so a rule the
	 * filter turns down keeps its place and goes quiet, exactly as the board
	 * dims it. Same argument as `filtered`'s own: a hit lights its ancestors.
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
	const columns = Math.max(1, board.ruleOrder.length);

	// Every card measured before anything is placed: a row is as tall as its
	// tallest cell, and a cell as tall as the stack in it.
	const cards = new Map<Id, Measured>();
	for (const [id, rule] of Object.entries(board.rules)) {
		cards.set(id, measure('rule', rule.title, rule.notes, rule.tags, COLUMN));
	}
	for (const [id, question] of Object.entries(board.questions)) {
		cards.set(id, measure('question', question.title, question.notes, question.tags, COLUMN));
	}
	for (const [id, example] of Object.entries(board.examples)) {
		cards.set(id, measure('example', example.title, example.notes, example.tags, COLUMN, steps(example)));
	}

	const head = header(board, paint);

	/*
	 * The story card, spanning, and drawn only when there is one.
	 *
	 * A board with no story is an ordinary state — somebody opened a map before
	 * naming what it is about — and an empty yellow band across the top would be
	 * a card claiming a story exists.
	 */
	const width = PAD * 2 + RAIL + GAP + columns * COLUMN + (columns - 1) * GAP;
	const gridWidth = columns * COLUMN + (columns - 1) * GAP;
	const storyCard =
		board.story === null
			? null
			: measure(
					'story',
					board.story.title,
					board.story.notes,
					board.story.tags,
					gridWidth,
					need(board.story),
					meta(board.story.ticket, board.story.status),
				);
	const storyQuestions = (board.story?.questions ?? []).filter(shown);
	const storyHeight =
		storyCard === null
			? 0
			: CELL_PAD * 2 +
				storyCard.height +
				storyQuestions.reduce((total, id) => total + (cards.get(id)?.height ?? MIN_CARD) + CARD_GAP, 0);

	// The rule header row: the rule card, then the questions hanging off it.
	const ruleHeights = board.ruleOrder.map((ruleId) => {
		const rule = board.rules[ruleId];
		const own = cards.get(ruleId)?.height ?? MIN_CARD;
		const questions = (rule?.questionIds ?? []).filter(shown);
		return (
			CELL_PAD * 2 + own + questions.reduce((total, id) => total + (cards.get(id)?.height ?? MIN_CARD) + CARD_GAP, 0)
		);
	});
	const ruleHeight = Math.max(MIN_CELL, ...ruleHeights);

	const rows = bands(board).map((band) => {
		let tallest = MIN_CELL;
		for (const ruleId of board.ruleOrder) {
			const stack = examplesIn(board, ruleId, band).filter(shown);
			if (stack.length === 0) continue;
			const height =
				CELL_PAD * 2 +
				stack.reduce((total, id) => total + (cards.get(id)?.height ?? MIN_CARD), 0) +
				CARD_GAP * (stack.length - 1);
			if (height > tallest) tallest = height;
		}
		return { band, height: Math.max(tallest, railHeight(board, band)) };
	});

	const legendHeight = 18 + 20;
	const gridTop = PAD + head.height;
	const bodyHeight =
		(storyHeight === 0 ? 0 : storyHeight + GAP) +
		ruleHeight +
		GAP +
		rows.reduce((total, row) => total + row.height + GAP, 0);
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

	if (storyCard !== null) {
		out.push(label(PAD, y, RAIL, storyHeight, 'THE STORY', paint));
		let cardY = y + CELL_PAD;
		// Inset by `CELL_PAD`, exactly as an example is inside its cell. `measure`
		// takes the *cell* width and every draw takes that minus the padding, so
		// the story, the rules and the examples all start at the same left edge —
		// a header a few pixels wider than the column under it reads as a grid
		// that has slipped rather than as a heading.
		out.push(card('story', storyCard, columnX(0) + CELL_PAD, cardY, gridWidth - CELL_PAD * 2, paint, true));
		cardY += storyCard.height + CARD_GAP;
		for (const id of storyQuestions) {
			const measured = cards.get(id);
			if (!measured) continue;
			out.push(card('question', measured, columnX(0) + CELL_PAD, cardY, gridWidth - CELL_PAD * 2, paint, true));
			cardY += measured.height + CARD_GAP;
		}
		y += storyHeight + GAP;
	}

	out.push(label(PAD, y, RAIL, ruleHeight, 'THE RULES', paint));
	board.ruleOrder.forEach((ruleId, column) => {
		const rule = board.rules[ruleId];
		const measured = cards.get(ruleId);
		if (!rule || !measured) return;
		let cardY = y + CELL_PAD;
		out.push(card('rule', measured, columnX(column) + CELL_PAD, cardY, COLUMN - CELL_PAD * 2, paint, shown(ruleId)));
		cardY += measured.height + CARD_GAP;
		for (const id of rule.questionIds.filter(shown)) {
			const question = cards.get(id);
			if (!question) continue;
			out.push(card('question', question, columnX(column) + CELL_PAD, cardY, COLUMN - CELL_PAD * 2, paint, true));
			cardY += question.height + CARD_GAP;
		}
	});
	y += ruleHeight + GAP;

	for (const row of rows) {
		out.push(rail(board, row.band, PAD, y, row.height, paint));

		board.ruleOrder.forEach((ruleId, column) => {
			const x = columnX(column);
			out.push(
				`<rect x="${x}" y="${y}" width="${COLUMN}" height="${row.height}" rx="5" fill="none" stroke="${paint.rule}" stroke-width="1" stroke-dasharray="4 3"/>`,
			);

			let cardY = y + CELL_PAD;
			for (const id of examplesIn(board, ruleId, row.band).filter(shown)) {
				const measured = cards.get(id);
				if (!measured) continue;
				out.push(card('example', measured, x + CELL_PAD, cardY, COLUMN - CELL_PAD * 2, paint, true));
				cardY += measured.height + CARD_GAP;
			}
		});

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
	// into `String.fromCharCode` overflows the argument stack on a large map.
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
	readonly body: readonly string[];
	readonly notes: readonly string[];
	readonly tags: readonly string[];
}

/**
 * An example's steps, in Gherkin's order and with Gherkin's `And`.
 *
 * The same rendering `gherkin.ts` performs, and deliberately so: the picture
 * and the feature file are two views of one thing, and a card that read
 * "given / given" where the `.feature` reads "Given / And" would make somebody
 * checking one against the other think a step had been lost.
 */
function steps(example: { given: readonly string[]; when: readonly string[]; then: readonly string[] }): readonly string[] {
	const lines: string[] = [];
	for (const clause of STEP_CLAUSES) {
		example[clause]
			.map((line) => line.trim())
			.filter((line) => line !== '')
			.forEach((line, index) => {
				lines.push(`${index === 0 ? clauseKeyword[clause] : 'And'} ${line}`);
			});
	}
	return lines;
}

/** The story's three clauses, spelled out rather than summarised. */
function need(story: { persona: string | null; want: string | null; soThat: string | null }): readonly string[] {
	return [
		story.persona === null ? null : `As ${story.persona}`,
		story.want === null ? null : `I want ${story.want}`,
		story.soThat === null ? null : `so that ${story.soThat}`,
	].filter((line): line is string => line !== null);
}

/**
 * The ticket and the status, on one line, and only when they say something.
 *
 * `open` on an unlinked story is the local placeholder for "nothing has been
 * said about this yet" — printing it would put a status on a map where nobody
 * set one, which is a picture claiming more than the file does.
 */
function meta(ticket: string | null, status: keyof typeof storyStatusLabel): string | null {
	const parts = [ticket, status === 'open' && ticket === null ? null : storyStatusLabel[status]].filter(
		(part): part is string => part !== null,
	);
	return parts.length === 0 ? null : parts.join('  ·  ');
}

function measure(
	kind: CardKind,
	title: string,
	notes: readonly string[],
	tags: readonly string[],
	width: number,
	body: readonly string[] = [],
	metaLine: string | null = null,
): Measured {
	const inner = width - CELL_PAD * 2 - CARD_PAD * 2;
	const titleLines = wrap(title, inner, TITLE_SIZE, ADVANCE_BOLD);
	const bodyLines = body.flatMap((line) => wrap(line, inner, NOTE_SIZE, ADVANCE_PLAIN));
	const noteLines = notes.flatMap((note) =>
		note.split('\n').flatMap((line) => wrap(line, inner, NOTE_SIZE, ADVANCE_PLAIN)),
	);

	const height =
		CARD_PAD * 2 +
		KIND_LEAD +
		titleLines.length * TITLE_LEAD +
		(metaLine === null ? 0 : 4 + META_LEAD) +
		(bodyLines.length > 0 ? 5 + bodyLines.length * NOTE_LEAD : 0) +
		(noteLines.length > 0 ? 5 + noteLines.length * NOTE_LEAD : 0) +
		(tags.length > 0 ? 5 + TAG_LEAD : 0);

	return {
		height: Math.max(MIN_CARD, height),
		kind: cardLabel[kind],
		title: titleLines,
		meta: metaLine,
		body: bodyLines,
		notes: noteLines,
		tags,
	};
}

/**
 * One card.
 *
 * `lit` is false for a rule the filter turned down but whose column the map
 * still needs. Those are drawn at reduced opacity rather than omitted, which is
 * the one place this picture keeps the board's dimming — see `PictureOptions`.
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
		`<rect x="${round(x)}" y="${y}" width="${round(width)}" height="${measured.height}" rx="4" fill="${swatch.fill}" stroke="${swatch.edge}" stroke-width="1.25"/>`,
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
			text(x + CARD_PAD, top + 10, measured.meta, { size: META_SIZE, fill: paint.ink, opacity: 0.7, weight: 600 }),
		);
		top += META_LEAD;
	}

	if (measured.body.length > 0) {
		top += 5;
		for (const line of measured.body) {
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
	const delivery = band === UNSCHEDULED ? null : board.deliveries[band];
	const title = delivery?.title ?? 'Not scheduled';
	const notes = delivery?.notes ?? [];
	return (
		CELL_PAD * 2 +
		20 +
		TITLE_LEAD * wrap(title, inner, TITLE_SIZE, ADVANCE_BOLD).length +
		(notes.length > 0 ? 6 + NOTE_LEAD * notes.flatMap((n) => wrap(n, inner, NOTE_SIZE, ADVANCE_PLAIN)).length : 0)
	);
}

/**
 * One band's name down the left.
 *
 * The unscheduled row is named rather than left blank. An example nobody has
 * committed to is not a leftover — it is a case the room found and has not
 * planned — and a nameless row at the bottom of a picture reads as one.
 */
function rail(board: BoardState, band: BandId, x: number, y: number, height: number, paint: Palette): string {
	const inner = RAIL - CELL_PAD * 2;
	const delivery = band === UNSCHEDULED ? null : board.deliveries[band];
	const kind = delivery === null ? 'NOT PLANNED' : delivery.kind.toUpperCase();
	const title = delivery?.title ?? 'Not scheduled';

	const out: string[] = [
		`<rect x="${x}" y="${y}" width="${RAIL}" height="${height}" rx="5" fill="${paint.raised}" stroke="${paint.rule}" stroke-width="1" stroke-opacity="0.6"/>`,
	];

	let top = y + CELL_PAD;
	out.push(text(x + CELL_PAD, top + 8, kind, { size: KIND_SIZE, fill: paint.inkMuted, weight: 600, spacing: 0.6 }));
	top += KIND_LEAD;

	for (const line of wrap(title, inner, TITLE_SIZE, ADVANCE_BOLD)) {
		out.push(text(x + CELL_PAD, top + 12, line, { size: TITLE_SIZE, fill: paint.ink, weight: 700 }));
		top += TITLE_LEAD;
	}

	const badge = [delivery?.ticket, delivery?.points === null || delivery?.points === undefined ? null : `${delivery.points} pts`]
		.filter((part): part is string => Boolean(part))
		.join(' · ');
	if (badge !== '') {
		out.push(text(x + CELL_PAD, top + 10, badge, { size: META_SIZE, fill: paint.inkMuted }));
		top += META_LEAD;
	}

	for (const line of (delivery?.notes ?? []).flatMap((n) => wrap(n, inner, NOTE_SIZE, ADVANCE_PLAIN))) {
		out.push(text(x + CELL_PAD, top + 11, line, { size: NOTE_SIZE, fill: paint.inkMuted }));
		top += NOTE_LEAD;
	}

	return out.join('');
}

/** A caption down the rail beside the story and rule rows. */
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
		text(x, y + 10, 'THE FOUR CARDS', { size: 9, fill: paint.inkMuted, weight: 600, spacing: 0.8 }),
	];
	CARD_KINDS.forEach((kind, index) => {
		const entryX = x + index * 190;
		const entryY = y + 26;
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
