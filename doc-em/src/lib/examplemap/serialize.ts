/**
 * Render an example map back to `.examplemap` text.
 *
 * Deterministic and total, with no timestamp: a timestamp would make every
 * export differ from the last, and diffing is most of the reason to have a text
 * format at all.
 *
 * ## What survives a round trip
 *
 * | Preserved                                  | Not preserved                      |
 * | ------------------------------------------ | ---------------------------------- |
 * | Map title                                  | Comments — every one of them       |
 * | The story, and its questions               | Blank lines                        |
 * | Rules, in order                            | Indentation width and style        |
 * | Examples under each rule, in order         | `{ }` on an empty card (omitted)   |
 * | Questions under each rule, in order        |                                    |
 * | Notes, and their line breaks               |                                    |
 *
 * The contract is the one doc-sm holds to:
 *
 *     serialize(parse(serialize(d))) === serialize(d)
 *
 * The output is a fixed point, which is what makes "export, hand-edit,
 * re-import" safe.
 */

import { wrapNote, type ExampleMapDocument, type QuestionNode } from './model.ts';

const INDENT = '  ';

const BANNER = [
	'// Example map exported by doc-em.',
	'// Comments and blank lines in an imported file are not preserved: the board',
	'// is the source, this file is a render of it.',
	'',
].join('\n');

export function serialize(document: ExampleMapDocument): string {
	const out: string[] = [BANNER];

	out.push(`examplemap ${quote(document.title)} {`);
	for (const note of document.notes) emitNote(out, INDENT, note);

	// The story first, always: it is what the session is about, and a map that
	// listed its rules before naming its story would read backwards.
	if (document.notes.length > 0) out.push('');
	emitCard(out, INDENT, 'story', document.story.title, document.story.notes, (inner) => {
		emitQuestions(out, inner, document.story.questions);
	});

	for (const rule of document.rules) {
		out.push('');
		emitCard(out, INDENT, 'rule', rule.title, rule.notes, (inner) => {
			for (const example of rule.examples) {
				emitCard(out, inner, 'example', example.title, example.notes, undefined);
			}
			emitQuestions(out, inner, rule.questions);
		});
	}

	out.push('}');
	return `${out.join('\n')}\n`;
}

function emitQuestions(out: string[], indent: string, questions: readonly QuestionNode[]): void {
	for (const question of questions) {
		emitCard(out, indent, 'question', question.title, question.notes, undefined);
	}
}

/**
 * One card, with a body only when it has something in it.
 *
 * `rule "…"` with nothing under it is a real state — the practice calls a rule
 * with no examples the sign that nobody understands it yet — so an empty body is
 * omitted rather than written as `{ }`.
 */
function emitCard(
	out: string[],
	indent: string,
	keyword: string,
	title: string,
	notes: readonly string[],
	children: ((inner: string) => void) | undefined,
): void {
	const head = `${indent}${keyword} ${quote(title)}`;
	const inner = indent + INDENT;

	// The head is written last, once it is known whether there is a body — so a
	// placeholder holds its place while the children decide.
	const headAt = out.length;
	out.push('');
	for (const note of notes) emitNote(out, inner, note);
	children?.(inner);

	if (out.length === headAt + 1) {
		out[headAt] = head;
		return;
	}
	out[headAt] = `${head} {`;
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
