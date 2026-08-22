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
 * | Product and ticketing space                | Blank lines                        |
 * | The story, its ticket and its status       | A `~open` status (it is the default) |
 * | Rules, in order                            | Indentation width and style        |
 * | Examples under each rule, in order         | `{ }` on an empty card (omitted)   |
 * | Questions under each rule, in order        |                                    |
 * | Notes, and their line breaks               | The order steps were typed in      |
 * | Steps, as Given / When / Then buckets      | Empty steps opened but not written |
 *
 * The contract is the one doc-sm holds to:
 *
 *     serialize(parse(serialize(d))) === serialize(d)
 *
 * The output is a fixed point, which is what makes "export, hand-edit,
 * re-import" safe.
 */

import {
	DEFAULT_STORY_STATUS,
	STEP_CLAUSES,
	wrapNote,
	type ExampleMapDocument,
	type ExampleNode,
	type QuestionNode,
	type StoryNode,
} from './model.ts';

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

	// What the map is about, before what it says — the same order the board
	// reads top to bottom, and the order a reader scanning the file expects.
	if (document.product !== null) out.push(`${INDENT}product ${quote(document.product)}`);
	if (document.space !== null) out.push(`${INDENT}space ${quote(document.space)}`);
	if (document.product !== null || document.space !== null) out.push('');

	for (const note of document.notes) emitNote(out, INDENT, note);

	// The story first, always: it is what the session is about, and a map that
	// listed its rules before naming its story would read backwards.
	if (document.notes.length > 0) out.push('');
	emitCard(
		out,
		INDENT,
		'story',
		document.story.title,
		document.story.notes,
		(inner) => {
			emitQuestions(out, inner, document.story.questions);
		},
		storyAnnotations(document.story),
	);

	for (const rule of document.rules) {
		out.push('');
		emitCard(out, INDENT, 'rule', rule.title, rule.notes, (inner) => {
			for (const example of rule.examples) {
				emitCard(out, inner, 'example', example.title, example.notes, (deepest) => {
					emitSteps(out, deepest, example);
				});
			}
			emitQuestions(out, inner, rule.questions);
		});
	}

	out.push('}');
	return `${out.join('\n')}\n`;
}

/**
 * An example's steps, always in Gherkin's order whatever order they were typed.
 *
 * Normalising here rather than preserving the author's order is the one place
 * this serializer rewrites rather than renders, and it is worth it: `Given`
 * after `Then` is not a scenario, and a file that kept it would produce a
 * feature file no Cucumber accepts. Since the buckets are separate fields, this
 * costs nothing — there is no order to lose.
 *
 * Blank entries are dropped. On the board an empty step is a line somebody
 * opened and has not written; in a file it would be `given ""`, which asserts
 * nothing and re-imports as the same nothing.
 */
function emitSteps(out: string[], indent: string, example: ExampleNode): void {
	for (const clause of STEP_CLAUSES) {
		for (const step of example[clause]) {
			if (step.trim() === '') continue;
			out.push(`${indent}${clause} ${quote(step)}`);
		}
	}
}

/**
 * The story's `#ticket ~status`, or as much of it as is worth writing.
 *
 * An unlinked story writes neither. `~open` is omitted too, because it is the
 * default and a file that spelled it on every map would be saying "nothing has
 * been decided" in words on every line where nothing has been decided — noise
 * that a reader learns to skip, which is the worst thing a field can become.
 * Omission and `~open` parse back to the same story, so nothing is lost.
 *
 * A status *is* written for a linked story even when it is `open`, since there
 * the value is a cached answer from the ticketing system rather than an absence
 * of one, and those are different facts.
 */
function storyAnnotations(story: StoryNode): string {
	const parts: string[] = [];
	if (story.ticket !== null) parts.push(`#${identOrString(story.ticket)}`);
	if (story.ticket !== null || story.status !== DEFAULT_STORY_STATUS) parts.push(`~${story.status}`);
	return parts.length === 0 ? '' : ` ${parts.join(' ')}`;
}

/**
 * A ticket id bare when the scanner will read it back as one token, quoted when
 * it will not.
 *
 * `#CLONB-42` is what a tracker issues and what everyone writes by hand, so it
 * is what the exporter emits. But nothing stops a tracker from issuing an id
 * with a slash or a space in it, and writing that bare would produce a file this
 * parser cannot read — so those are quoted instead of being emitted as something
 * that will not round-trip.
 */
function identOrString(id: string): string {
	// Must match the lexer's IDENT_START / IDENT_PART.
	return /^[A-Za-z0-9_][A-Za-z0-9_-]*$/.test(id) ? id : quote(id);
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
	/**
	 * What follows the title on the head line — the story's `#ticket ~status`,
	 * and nothing else. Last and optional so the three call sites that have no
	 * annotations do not each have to pass an empty string past a callback.
	 */
	annotations = '',
): void {
	const head = `${indent}${keyword} ${quote(title)}${annotations}`;
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
