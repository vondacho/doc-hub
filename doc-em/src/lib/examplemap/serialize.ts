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
 * | Deliveries, with tickets and sprint sizes  | A `~open` status (it is the default) |
 * | Which delivery the story and each example ship in |                             |
 * | The story, when there is one, with its      | An unwritten need clause (omitted)  |
 * | ticket, status, release and need           | A map with no story writes no line  |
 * | The story's as / want / so, when written   |                                    |
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
	type DeliveryNode,
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

	// The timeline before anything placed on it, so a reader meets the bands
	// before the first `@` that names one. It is also the order the parser is
	// happiest in, though it does not require it.
	for (const delivery of document.deliveries) emitDelivery(out, INDENT, delivery);
	if (document.deliveries.length > 0) out.push('');

	for (const note of document.notes) emitNote(out, INDENT, note);

	// The story first when there is one: it is what the session is about, and a
	// map that listed its rules before naming its story would read backwards. A
	// map with no story writes no `story` line at all rather than a placeholder,
	// which is what makes "nobody has named one" survive a round trip.
	const story = document.story;
	if (story !== null) {
		if (document.notes.length > 0) out.push('');
		emitCard(
			out,
			INDENT,
			'story',
			story.title,
			story.notes,
			(inner) => {
				emitNeed(out, inner, story);
				emitQuestions(out, inner, story.questions);
			},
			storyAnnotations(story),
		);
	}

	for (const rule of document.rules) {
		out.push('');
		emitCard(out, INDENT, 'rule', rule.title, rule.notes, (inner) => {
			for (const example of rule.examples) {
				emitCard(
					out,
					inner,
					'example',
					example.title,
					example.notes,
					(deepest) => {
						emitSteps(out, deepest, example);
					},
					deliveryAnnotation(example),
				);
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
	if (story.release !== null) parts.push(`@${identOrString(story.release)}`);
	return parts.length === 0 ? '' : ` ${parts.join(' ')}`;
}

/**
 * `@Sprint1` on an example, or nothing for one nobody has scheduled.
 *
 * Nothing, and not `@none`: the below-the-line band is the absence of a
 * reference, so there is no sentinel to spell wrong and no way for an
 * unscheduled example to read as scheduled to something odd.
 */
function deliveryAnnotation(example: ExampleNode): string {
	return example.delivery === null ? '' : ` @${identOrString(example.delivery)}`;
}

/**
 * `delivery "Sprint 1" sprint #CLONB-S24 points 13`, with a body only for a note.
 *
 * The `kind === 'sprint'` guard on the points is not belt-and-braces. It is the
 * one place that makes an unparseable export unreachable: only a sprint may be
 * sized, so a release that somehow held a number writes a file that still reads
 * back rather than one the parser will reject on the next import.
 */
function emitDelivery(out: string[], indent: string, delivery: DeliveryNode): void {
	const ticket = delivery.ticket === null ? '' : ` #${identOrString(delivery.ticket)}`;
	const points = delivery.kind === 'sprint' && delivery.points !== null ? ` points ${delivery.points}` : '';
	const head = `${indent}delivery ${quote(delivery.title)} ${delivery.kind}${ticket}${points}`;
	if (delivery.notes.length === 0) {
		out.push(head);
		return;
	}
	out.push(`${head} {`);
	for (const note of delivery.notes) emitNote(out, indent + INDENT, note);
	out.push(`${indent}}`);
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

/**
 * The story's need, one clause per line, in the order the sentence reads.
 *
 * Written before the questions rather than after, because the need is what the
 * story *is* and a question is a doubt about it. A file that listed the doubts
 * first would read backwards.
 *
 * Unwritten clauses are omitted, not written empty. `want ""` asserts nothing
 * and re-imports as the same nothing, and a card showing three blank clauses is
 * indistinguishable from one nobody has started.
 *
 * Not wrapped to the note measure. A clause is one clause of one sentence and
 * the parser collapses whitespace inside it, so breaking it across lines would
 * be a formatting choice the reader cannot see and the parser then undoes.
 */
function emitNeed(out: string[], indent: string, story: StoryNode): void {
	if (story.persona !== null) out.push(`${indent}as ${quote(story.persona)}`);
	if (story.want !== null) out.push(`${indent}want ${quote(story.want)}`);
	if (story.soThat !== null) out.push(`${indent}so ${quote(story.soThat)}`);
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
	 * What follows the title on the head line — the story's `#ticket ~status
	 * @release`, or an example's `@delivery`. Last and optional so the call sites
	 * with no annotations do not each have to pass an empty string past a
	 * callback.
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
