/**
 * Render an event storm back to `.eventstorm` text.
 *
 * Deterministic and total, with no timestamp: a timestamp would make every
 * export differ from the last, and diffing is most of the reason to have a text
 * format at all.
 *
 * ## What survives a round trip
 *
 * | Preserved                                  | Not preserved                      |
 * | ------------------------------------------ | ---------------------------------- |
 * | Storm title, the product and the level     | Comments — every one of them       |
 * |                                            | `level big-picture`, which is the default |
 * | Lanes, in order                            | Blank lines                        |
 * | Every card's kind, words and column        | Indentation width and style        |
 * | Notes, and their line breaks               | `{ }` on an empty card (omitted)   |
 * |                                            | Cards written before the first lane, which are gathered into one |
 *
 * The contract is the one the other two boards hold to:
 *
 *     serialize(parse(serialize(d))) === serialize(d)
 *
 * The output is a fixed point, which is what makes "export, hand-edit,
 * re-import" safe. Note the one normalisation above: loose cards written before
 * any `lane` line come back inside an explicit lane, and every card comes back
 * with its `@column` written out — so the *second* export matches the first even
 * where the first did not match the input.
 */

import { cardKeyword, wrapNote, type CardNode, type EventStormDocument, type LaneNode } from './model.ts';

const INDENT = '  ';

const BANNER = [
	'// Event storm exported by doc-es.',
	'// Comments and blank lines in an imported file are not preserved: the board',
	'// is the source, this file is a render of it.',
	'',
].join('\n');

export function serialize(document: EventStormDocument): string {
	const out: string[] = [BANNER];

	out.push(`eventstorm ${quote(document.title)} {`);

	if (document.product !== null) out.push(`${INDENT}product ${quote(document.product)}`);
	// Written only when it is not the default, the way `~open` is omitted on the
	// other two boards: a big-picture storm is what a storm is unless somebody
	// says otherwise, and spelling it on every file would be noise on the common
	// case. Omitted and `big-picture` parse back to the same document.
	if (document.level !== 'big-picture') out.push(`${INDENT}level ${document.level}`);
	if (document.product !== null || document.level !== 'big-picture') out.push('');

	for (const note of document.notes) emitNote(out, INDENT, note);
	if (document.notes.length > 0) out.push('');

	document.lanes.forEach((lane, index) => {
		if (index > 0) out.push('');
		emitLane(out, INDENT, lane);
	});

	out.push('}');
	return `${out.join('\n')}\n`;
}

/**
 * One lane, written even when it is empty.
 *
 * Unlike a card, whose empty body is omitted, a lane with no cards is written
 * out in full — it is a row somebody has named and not yet filled, and dropping
 * it would delete a decision. An empty *body* is still omitted: `lane "Customer"`
 * says everything `lane "Customer" { }` does.
 *
 * Cards come out sorted by column, whatever order they were typed in. The column
 * is the position, so the file lists them the way the lane reads — and two cards
 * sharing a column keep the order they were written, because that is a genuine
 * stacking order the coordinate does not record.
 */
function emitLane(out: string[], indent: string, lane: LaneNode): void {
	const head = `${indent}lane ${quote(lane.title)}`;
	const inner = indent + INDENT;

	if (lane.notes.length === 0 && lane.cards.length === 0) {
		out.push(head);
		return;
	}

	out.push(`${head} {`);
	for (const note of lane.notes) emitNote(out, inner, note);
	// A stable sort, which is what keeps two cards at one column in their order.
	for (const card of [...lane.cards].sort((a, b) => a.column - b.column)) emitCard(out, inner, card);
	out.push(`${indent}}`);
}

/**
 * One card: its keyword, its words, and a body only when it carries a note.
 *
 * The keyword is the kind. There is no separate colour or type annotation,
 * because a card whose keyword said one thing and whose annotation said another
 * would be a state the file could express and the board could not.
 *
 * `@column` is always written, even where the parser would have inferred it.
 * The coordinate is the fact; leaving it out on export would make a file's
 * meaning depend on the order of the lines around it, which is exactly what the
 * column exists to stop.
 */
function emitCard(out: string[], indent: string, card: CardNode): void {
	const head = `${indent}${cardKeyword[card.kind]} ${quote(card.title)} @${card.column}`;
	if (card.notes.length === 0) {
		out.push(head);
		return;
	}
	out.push(`${head} {`);
	for (const note of card.notes) emitNote(out, indent + INDENT, note);
	out.push(`${indent}}`);
}

/** `note "…"` — one string, carried onto further lines by a trailing backslash. */
function emitNote(out: string[], indent: string, text: string): void {
	const lines = wrapNote(text).split('\n').map(escapeSegment);
	const pad = `${indent}     `;

	if (lines.length === 1) {
		out.push(`${indent}note "${lines[0]}"`);
		return;
	}
	out.push(`${indent}note "${lines[0]}\\`);
	for (const line of lines.slice(1, -1)) out.push(`${pad}${line}\\`);
	out.push(`${pad}${lines[lines.length - 1]}"`);
}

function escapeSegment(line: string): string {
	return line.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\t/g, '\\t').replace(/\r/g, '');
}

function quote(text: string): string {
	const escaped = text
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"')
		.replace(/\n/g, '\\n')
		.replace(/\t/g, '\\t')
		.replace(/\r/g, '');
	return `"${escaped}"`;
}
