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
 * | Storm title, and the product               | Comments — every one of them       |
 * | Phases, in order                           | Blank lines                        |
 * | Cards under each phase, in order and kind  | Indentation width and style        |
 * | Notes, and their line breaks               | `{ }` on an empty card (omitted)   |
 * |                                            | Cards written before the first phase, which are gathered into one |
 *
 * The contract is the one the other two boards hold to:
 *
 *     serialize(parse(serialize(d))) === serialize(d)
 *
 * The output is a fixed point, which is what makes "export, hand-edit,
 * re-import" safe. Note the one normalisation above: loose cards written before
 * any `phase` line come back inside an explicit phase, so the *second* export
 * matches the first even though the first did not match the input.
 */

import { cardKeyword, wrapNote, type CardNode, type EventStormDocument, type PhaseNode } from './model.ts';

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

	if (document.product !== null) {
		out.push(`${INDENT}product ${quote(document.product)}`);
		out.push('');
	}

	for (const note of document.notes) emitNote(out, INDENT, note);
	if (document.notes.length > 0) out.push('');

	document.phases.forEach((phase, index) => {
		if (index > 0) out.push('');
		emitPhase(out, INDENT, phase);
	});

	out.push('}');
	return `${out.join('\n')}\n`;
}

/**
 * One phase, written even when it is empty.
 *
 * Unlike a card, whose empty body is omitted, a phase with no cards is written
 * out in full — it is a stretch of wall somebody has named and not yet filled,
 * and dropping it would delete a decision. An empty *body* is still omitted:
 * `phase "Checkout"` says everything `phase "Checkout" { }` does.
 */
function emitPhase(out: string[], indent: string, phase: PhaseNode): void {
	const head = `${indent}phase ${quote(phase.title)}`;
	const inner = indent + INDENT;

	if (phase.notes.length === 0 && phase.cards.length === 0) {
		out.push(head);
		return;
	}

	out.push(`${head} {`);
	for (const note of phase.notes) emitNote(out, inner, note);
	for (const card of phase.cards) emitCard(out, inner, card);
	out.push(`${indent}}`);
}

/**
 * One card: its keyword, its words, and a body only when it carries a note.
 *
 * The keyword is the kind. There is no separate colour or type annotation,
 * because a card whose keyword said one thing and whose annotation said another
 * would be a state the file could express and the board could not.
 */
function emitCard(out: string[], indent: string, card: CardNode): void {
	const head = `${indent}${cardKeyword[card.kind]} ${quote(card.title)}`;
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
