/**
 * Every gesture on the board, as an edit to the source text.
 *
 * ba-ddd-mapper's `src/lib/graph/edit.ts`, one notation across. The rule is the
 * same and it is the reason this module exists at all: **the file is the
 * artefact**, so a drag replaces the bytes it is actually about and everything
 * else — comments, blank lines, somebody's own column alignment — comes back
 * untouched. A board that re-rendered the whole document after every gesture
 * would produce a diff touching every line and would eat the comments on the
 * way past.
 *
 * Nothing here parses and nothing here validates. Each function takes the
 * source, the document last parsed from it, and the gesture; it hands back a
 * new string. The board re-parses, and the problems panel says what happened.
 *
 * ## Positions, not identities
 *
 * A card is addressed by where it is written — `{ lane, card }`, both indices
 * into the parsed document. See the note at the top of `convert.ts` for why the
 * board has no other kind of identity to offer. Every function resolves the
 * position against the document it was handed, so an id from a *stale* document
 * is refused rather than applied to whatever now sits at that index: each one
 * returns the source unchanged when the position does not resolve.
 */

import {
	cardKeyword,
	joinNotes,
	splitNotes,
	wrapNote,
	type CardKind,
	type CardNode,
	type EventStormDocument,
	type LaneNode,
	type Span,
} from '../eventstorm/model.ts';
import {
	blockEnd,
	indentInside,
	INDENT,
	lineIndent,
	lineRegion,
	quote,
	quoteIfNeeded,
	splice,
	spliceAll,
} from './source.ts';

/** Where a card is written: which lane, and which card inside it. */
export interface CardAt {
	readonly lane: number;
	readonly card: number;
}

const laneAt = (document: EventStormDocument, index: number): LaneNode | undefined =>
	document.lanes[index];

const cardAt = (document: EventStormDocument, at: CardAt): CardNode | undefined =>
	document.lanes[at.lane]?.cards[at.card];

/**
 * Whether this document can be spliced at all.
 *
 * A document built by `toBoard`'s inverse — or an empty one — carries no source
 * and every span points at offset zero. Splicing one would write to the top of
 * whatever text happened to be on screen.
 */
const unwritable = (document: EventStormDocument): boolean => document.source === '';

// ---------------------------------------------------------------------------
// The storm
// ---------------------------------------------------------------------------

export function setMapTitle(source: string, document: EventStormDocument, title: string): string {
	if (unwritable(document)) return source;
	return splice(source, document.titleSpan, quote(title));
}

/**
 * `product "…"`, written, replaced or taken away.
 *
 * Three cases rather than one, because the line may not be there: a storm that
 * is not about a registered product has no `product` line at all, and clearing
 * the picker has to remove the line rather than write `product ""`.
 */
export function setProduct(
	source: string,
	document: EventStormDocument,
	product: string | null,
): string {
	if (unwritable(document)) return source;

	if (product === null) {
		if (document.productSpan === null) return source;
		return splice(source, lineRegion(source, document.productSpan), '');
	}

	const line = `product ${quote(product)}`;
	if (document.productSpan !== null) return splice(source, document.productSpan, line);

	return insertAtTopOfStorm(source, document, line);
}

/**
 * A line at the top of the storm's block, under any that are already there.
 *
 * `product` is the only such line left — the level used to be the other, and is
 * now discovered from the cards rather than written down (see `Level`). The
 * anchoring is kept general because the shape of the problem is: a line that
 * belongs above the lanes and below the title has to land after whichever of
 * its siblings is already there rather than jumping over it.
 */
function insertAtTopOfStorm(
	source: string,
	document: EventStormDocument,
	line: string,
): string {
	const indent = indentInside(source, document.openBrace);

	const existing = [document.productSpan].filter((span) => span !== null);
	if (existing.length > 0) {
		const last = existing.reduce((a, b) => (a.end > b.end ? a : b));
		const region = lineRegion(source, last);
		return splice(source, { ...region, start: region.end, end: region.end }, `${indent}${line}\n`);
	}

	if (document.openBrace < 0) return source;
	const after = document.openBrace + 1;
	return splice(source, { start: after, end: after, line: 0, column: 0 }, `\n${indent}${line}\n`);
}

// ---------------------------------------------------------------------------
// Lanes
// ---------------------------------------------------------------------------

/** A lane name nothing is using, so adding twice does not collide. */
export function unusedLaneTitle(document: EventStormDocument, base = 'New lane'): string {
	const taken = new Set(document.lanes.map((lane) => lane.title));
	if (!taken.has(base)) return base;
	for (let n = 2; ; n += 1) if (!taken.has(`${base} ${n}`)) return `${base} ${n}`;
}

export function addLane(source: string, document: EventStormDocument, index: number): string {
	if (unwritable(document) || document.openBrace < 0) return source;

	const indent = indentInside(source, document.openBrace);
	const title = unusedLaneTitle(document);
	const block = `${indent}lane ${quote(title)} {\n${indent}}\n`;

	const before = document.lanes[index];
	if (before !== undefined) {
		const region = lineRegion(source, before.span);
		return splice(source, { ...region, end: region.start }, `${block}\n`);
	}

	// After the last lane, or — for the first lane on an empty storm — just
	// inside the storm's own closing brace.
	const last = document.lanes[document.lanes.length - 1];
	if (last !== undefined) {
		const region = lineRegion(source, last.span);
		return splice(source, { ...region, start: region.end, end: region.end }, `\n${block}`);
	}

	const close = blockEnd(source, document.openBrace) - 1;
	const gap = /\n[ \t]*$/.test(source.slice(0, close)) ? '' : '\n';
	return splice(source, { start: close, end: close, line: 0, column: 0 }, `${gap}${block}`);
}

export function retitleLane(
	source: string,
	document: EventStormDocument,
	index: number,
	title: string,
): string {
	const lane = laneAt(document, index);
	if (lane === undefined || unwritable(document)) return source;
	return splice(source, lane.titleSpan, quote(title));
}

export function removeLane(source: string, document: EventStormDocument, index: number): string {
	const lane = laneAt(document, index);
	if (lane === undefined || unwritable(document)) return source;
	return splice(source, lineRegion(source, lane.span), '');
}

/**
 * A lane moved to another row, as a cut and a paste.
 *
 * The lane's whole block travels — its cards, its notes and any comment written
 * between them — because what moved is the row, not a list of titles.
 */
export function moveLane(
	source: string,
	document: EventStormDocument,
	from: number,
	to: number,
): string {
	const lane = laneAt(document, from);
	if (lane === undefined || unwritable(document) || from === to) return source;

	const region = lineRegion(source, lane.span);
	const block = source.slice(region.start, region.end);

	// Computed on the text with the lane still in it, then applied together:
	// `spliceAll` works right to left, so neither offset is stale by the time it
	// is used.
	const anchor = anchorForLane(source, document, from, to);
	if (anchor === null) return source;

	return spliceAll(source, [
		{ span: region, replacement: '' },
		{ span: { start: anchor, end: anchor, line: 0, column: 0 }, replacement: block },
	]);
}

/** The offset a lane moved to row `to` should be written at. */
function anchorForLane(
	source: string,
	document: EventStormDocument,
	from: number,
	to: number,
): number | null {
	const others = document.lanes.filter((_, index) => index !== from);
	const before = others[to];
	if (before !== undefined) return lineRegion(source, before.span).start;

	const last = others[others.length - 1];
	if (last !== undefined) return lineRegion(source, last.span).end;

	return document.openBrace < 0 ? null : blockEnd(source, document.openBrace) - 1;
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/** One card declaration, as the format writes it. */
function cardText(kind: CardKind, title: string, column: number): string {
	return `${cardKeyword[kind]} ${quote(title)} @${column}`;
}

export function addCard(
	source: string,
	document: EventStormDocument,
	laneIndex: number,
	column: number,
	kind: CardKind,
): string {
	const lane = laneAt(document, laneIndex);
	if (lane === undefined || unwritable(document)) return source;

	const text = cardText(kind, 'New note', column);

	// A lane written without a block has to grow one before it can hold a card.
	if (lane.openBrace < 0) {
		const outer = lineIndent(source, lane.span.start);
		const inner = outer + INDENT;
		return splice(
			source,
			{ ...lane.span, start: lane.span.end },
			` {\n${inner}${text}\n${outer}}`,
		);
	}

	const indent = indentInside(source, lane.openBrace);
	const anchor = anchorForCard(source, lane, column, Number.MAX_SAFE_INTEGER);
	return splice(source, { start: anchor, end: anchor, line: 0, column: 0 }, `${indent}${text}\n`);
}

export function retitleCard(
	source: string,
	document: EventStormDocument,
	at: CardAt,
	title: string,
): string {
	const card = cardAt(document, at);
	if (card === undefined || unwritable(document)) return source;
	return splice(source, card.titleSpan, quote(title));
}

/**
 * A span grown left over the space in front of it.
 *
 * Removing an annotation without it leaves the gap that separated it from its
 * neighbour, so a set-then-clear does not return the line to where it started
 * and the stray space shows up in the diff.
 */
function withGap(source: string, span: Span): Span {
	let start = span.start;
	while (start > 0 && (source[start - 1] === ' ' || source[start - 1] === '\t')) start -= 1;
	return { ...span, start };
}

/**
 * `+tags` on a note, rewritten as one run.
 *
 * There is no single span to replace: tags are the one annotation a note may
 * carry several of, and they need not be written next to each other. So the run
 * is rewritten *where the first tag already is* and the rest are struck out —
 * which keeps a hand-written `+legal @4 +risk` from having its column rewritten
 * out of the middle, and leaves the column exactly where its author put it.
 *
 * A note with no tags yet gets the run appended past everything else on the
 * line — after the `@column` when there is one, so the coordinate stays next to
 * the words and the open-ended part goes last. Clearing the final tag takes the
 * space in front of it too.
 */
export function setCardTags(
	source: string,
	document: EventStormDocument,
	at: CardAt,
	tags: readonly string[],
): string {
	const card = cardAt(document, at);
	if (card === undefined || unwritable(document)) return source;

	const written = tags.map((tag) => `+${quoteIfNeeded(tag)}`).join(' ');
	const spans = card.tagSpans;

	if (spans.length === 0) {
		if (written === '') return source;
		const end = Math.max(card.titleSpan.end, card.columnSpan?.end ?? 0);
		return splice(source, { ...card.titleSpan, start: end, end }, ` ${written}`);
	}

	const [first, ...rest] = spans as readonly Span[] as [Span, ...Span[]];
	return spliceAll(source, [
		// Every tag after the first goes whatever happens to the first, because
		// the run is rewritten whole and leaving the old ones would double them.
		...rest.map((span) => ({ span: withGap(source, span), replacement: '' })),
		{ span: written === '' ? withGap(source, first) : first, replacement: written },
	]);
}

/**
 * A card's kind, changed by replacing its keyword.
 *
 * The keyword *is* the kind — there is no `~kind` annotation to disagree with
 * it — so this is the narrowest splice in the module: one word, and the note's
 * words, column and comments are not touched.
 */
export function setCardKind(
	source: string,
	document: EventStormDocument,
	at: CardAt,
	kind: CardKind,
): string {
	const card = cardAt(document, at);
	if (card === undefined || unwritable(document)) return source;
	return splice(source, card.kindSpan, cardKeyword[kind]);
}

export function removeCard(source: string, document: EventStormDocument, at: CardAt): string {
	const card = cardAt(document, at);
	if (card === undefined || unwritable(document)) return source;
	return splice(source, lineRegion(source, card.span), '');
}

/**
 * A card dragged to another square.
 *
 * Uniformly a cut and a paste, even when the lane does not change. Special-
 * casing "same lane, new column" to a rewrite of `@n` would be shorter and
 * would leave the declaration in the wrong place in the file: within one square
 * the stacking order *is* the order the lines are written, so a move that
 * changes which note is on top has to move the line.
 *
 * `index` is where in the destination square the card lands, counting the cards
 * already there — with itself removed from that count when it has not left the
 * square.
 */
export function moveCard(
	source: string,
	document: EventStormDocument,
	at: CardAt,
	toLane: number,
	toColumn: number,
	index: number,
): string {
	const card = cardAt(document, at);
	const lane = laneAt(document, toLane);
	if (card === undefined || lane === undefined || unwritable(document)) return source;

	const region = lineRegion(source, card.span);
	// Rewritten rather than moved verbatim: the column is part of the
	// declaration, and this is the gesture that changes it. Notes travel with it.
	const moved = source
		.slice(region.start, region.end)
		.replace(/@\d+/, `@${toColumn}`);
	const withColumn = /@\d+/.test(source.slice(card.span.start, card.span.end))
		? moved
		: withOrdinal(source, card, region, toColumn);

	const anchor = anchorForCard(source, lane, toColumn, index, at.lane === toLane ? at.card : -1);
	if (anchor === null) return source;

	return spliceAll(source, [
		{ span: region, replacement: '' },
		{ span: { start: anchor, end: anchor, line: 0, column: 0 }, replacement: withColumn },
	]);
}

/**
 * The same lines, with an `@column` added to a card written without one.
 *
 * A hand-written file may leave the ordinal off and let it default to the next
 * square along. The first drag of such a card is the moment it acquires one,
 * and it goes after the title rather than at the end of the block — where it
 * would land inside the card's notes.
 */
function withOrdinal(
	source: string,
	card: CardNode,
	region: { start: number; end: number },
	column: number,
): string {
	const offset = card.titleSpan.end - region.start;
	const block = source.slice(region.start, region.end);
	return `${block.slice(0, offset)} @${column}${block.slice(offset)}`;
}

/**
 * Where a card belongs in a lane's text, given the square and the depth.
 *
 * Cards are written in column order, and within one column in stacking order.
 * `skip` is the index of the card being moved, so it does not count itself when
 * it has not left the lane.
 */
function anchorForCard(
	source: string,
	lane: LaneNode,
	column: number,
	index: number,
	skip = -1,
): number {
	const siblings = lane.cards
		.map((card, position) => ({ card, position }))
		.filter(({ position }) => position !== skip);

	// The first card that should come *after* this one: a later column, or the
	// same column once `index` of them have been passed.
	let seen = 0;
	for (const { card } of siblings) {
		if (card.column > column) return lineRegion(source, card.span).start;
		if (card.column === column) {
			if (seen === index) return lineRegion(source, card.span).start;
			seen += 1;
		}
	}

	const last = siblings[siblings.length - 1];
	if (last !== undefined) return lineRegion(source, last.card.span).end;

	return lane.openBrace < 0 ? source.length : blockEnd(source, lane.openBrace) - 1;
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

/**
 * The `note` lines on a card or a lane, rewritten wholesale.
 *
 * Wholesale because the panel edits them as one block of text: what arrives is
 * the whole of what the notes should now say, and diffing it against the lines
 * that were there to produce a minimal splice would be a great deal of work to
 * make one textarea's edit look tidier in a diff it is already the subject of.
 *
 * Empty text removes the lines. A card whose block then holds nothing keeps its
 * braces — an empty `{ }` is legal, and stripping it would be a second edit the
 * gesture was not asked for.
 */
function setNotes(
	source: string,
	owner: { readonly span: { start: number; end: number }; readonly notesSpan: { start: number; end: number } | null },
	openBrace: number,
	text: string,
): string {
	const notes = splitNotes(text).filter((note) => note.trim() !== '');

	if (owner.notesSpan !== null) {
		if (notes.length === 0) {
			return splice(source, lineRegion(source, { ...owner.notesSpan, line: 0, column: 0 }), '');
		}
		const indent = lineIndent(source, owner.notesSpan.start);
		return splice(
			source,
			{ ...owner.notesSpan, line: 0, column: 0 },
			notes.map((note) => `note ${quote(note)}`).join(`\n${indent}`),
		);
	}

	if (notes.length === 0) return source;

	// No notes yet. Inside the block if there is one, and grow a block if not.
	if (openBrace < 0) {
		const outer = lineIndent(source, owner.span.start);
		const inner = outer + INDENT;
		const written = notes.map((note) => `${inner}note ${quote(note)}`).join('\n');
		return splice(
			source,
			{ start: owner.span.end, end: owner.span.end, line: 0, column: 0 },
			` {\n${written}\n${outer}}`,
		);
	}

	const indent = indentInside(source, openBrace);
	const close = blockEnd(source, openBrace) - 1;
	const written = notes.map((note) => `${indent}note ${quote(note)}`).join('\n');
	const gap = /\n[ \t]*$/.test(source.slice(0, close)) ? '' : '\n';
	return splice(source, { start: close, end: close, line: 0, column: 0 }, `${gap}${written}\n`);
}

export function setCardNotes(
	source: string,
	document: EventStormDocument,
	at: CardAt,
	text: string,
): string {
	const card = cardAt(document, at);
	if (card === undefined || unwritable(document)) return source;
	const open = card.notesSpan === null ? openBraceOf(source, card.span) : -2;
	return setNotes(source, card, open === -2 ? 0 : open, text);
}

export function setLaneNotes(
	source: string,
	document: EventStormDocument,
	index: number,
	text: string,
): string {
	const lane = laneAt(document, index);
	if (lane === undefined || unwritable(document)) return source;
	return setNotes(source, lane, lane.openBrace, text);
}

/** The `{` inside a card's own span, or -1 for a card written on one line. */
function openBraceOf(source: string, span: { start: number; end: number }): number {
	for (let at = span.start; at < span.end; at += 1) {
		const ch = source[at];
		if (ch === '"') {
			at += 1;
			while (at < span.end && source[at] !== '"') at += source[at] === '\\' ? 2 : 1;
			continue;
		}
		if (ch === '{') return at;
	}
	return -1;
}

export { joinNotes, wrapNote };
