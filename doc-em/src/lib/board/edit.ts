/**
 * Every gesture on the board, as an edit to the source text.
 *
 * ba-ddd-mapper's `src/lib/graph/edit.ts`, one notation across, and the third of
 * these to be written. The rule is the same and it is the reason this module
 * exists: **the file is the artefact**, so a gesture replaces the bytes it is
 * actually about and everything else — comments, blank lines, somebody's own
 * alignment — comes back untouched.
 *
 * Nothing here parses and nothing here validates. Each function takes the
 * source, the document last parsed from it, and the gesture; it hands back a new
 * string. The board re-parses, and the problems panel says what happened.
 *
 * ## Positions, not identities
 *
 * A card is addressed by where it is written — a rule index, an example index,
 * a question index and which parent it hangs from. See `convert.ts` for why the
 * board has no other kind of identity. Every function resolves the position
 * against the document it was handed and returns the source unchanged when it
 * does not resolve, so a position from a stale render is refused rather than
 * applied to whatever now sits at that index.
 */

import {
	STEP_CLAUSES,
	type AnnotationSpans,
	type DeliveryKind,
	type DeliveryNode,
	type ExampleMapDocument,
	type ExampleNode,
	type NeedField,
	type NodeSpans,
	type QuestionNode,
	type RuleNode,
	type Span,
	type StepClause,
	type StoryStatus,
} from '../examplemap/model.ts';
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

/** Where an example is written. */
export interface ExampleAt {
	readonly rule: number;
	readonly example: number;
}

/** Where a question is written — under a rule, or under the story. */
export interface QuestionAt {
	readonly rule: number | 'story';
	readonly question: number;
}

const ruleAt = (d: ExampleMapDocument, i: number): RuleNode | undefined => d.rules[i];
const exampleAt = (d: ExampleMapDocument, at: ExampleAt): ExampleNode | undefined =>
	d.rules[at.rule]?.examples[at.example];
const deliveryAt = (d: ExampleMapDocument, i: number): DeliveryNode | undefined => d.deliveries[i];
const questionAt = (d: ExampleMapDocument, at: QuestionAt): QuestionNode | undefined =>
	at.rule === 'story' ? d.story?.questions[at.question] : d.rules[at.rule]?.questions[at.question];

/** Whether this document can be spliced at all. */
const unwritable = (d: ExampleMapDocument): boolean => d.source === '';

/** Everything a splice needs from a node, whatever kind it is. */
type Spanned = { readonly spans: NodeSpans };

// ---------------------------------------------------------------------------
// The map
// ---------------------------------------------------------------------------

export function setMapTitle(source: string, d: ExampleMapDocument, title: string): string {
	if (unwritable(d)) return source;
	return splice(source, d.titleSpan, quote(title));
}

export function setProduct(source: string, d: ExampleMapDocument, product: string | null): string {
	return setHeaderLine(source, d, 'product', product, d.productSpan);
}

export function setSpace(source: string, d: ExampleMapDocument, space: string | null): string {
	return setHeaderLine(source, d, 'space', space, d.spaceSpan);
}

/** `product "…"` / `space "…"`, written, replaced or taken away. */
function setHeaderLine(
	source: string,
	d: ExampleMapDocument,
	keyword: 'product' | 'space',
	value: string | null,
	span: Span | null,
): string {
	if (unwritable(d)) return source;

	if (value === null) {
		return span === null ? source : splice(source, lineRegion(source, span), '');
	}

	const line = `${keyword} ${quote(value)}`;
	if (span !== null) return splice(source, span, line);

	const indent = indentInside(source, d.openBrace);
	const existing = [d.productSpan, d.spaceSpan].filter((s): s is Span => s !== null);
	if (existing.length > 0) {
		const last = existing.reduce((a, b) => (a.end > b.end ? a : b));
		const region = lineRegion(source, last);
		return splice(source, { ...region, start: region.end, end: region.end }, `${indent}${line}\n`);
	}
	if (d.openBrace < 0) return source;
	const after = d.openBrace + 1;
	return splice(source, { start: after, end: after, line: 0, column: 0 }, `\n${indent}${line}\n`);
}

// ---------------------------------------------------------------------------
// Annotations
// ---------------------------------------------------------------------------

/**
 * One annotation, set or cleared, on whatever card owns it.
 *
 * Written straight after the card's title when it is not already there, which
 * is where every one of them is written by hand and by the sample.
 */
function setAnnotation(
	source: string,
	owner: Spanned | undefined,
	which: keyof AnnotationSpans,
	text: string | null,
): string {
	if (owner === undefined) return source;
	const span = owner.spans.annotations[which];

	if (text === null) {
		if (span === null) return source;
		return splice(source, withGap(source, span), '');
	}

	if (span !== null) return splice(source, span, text);
	return splice(source, { ...owner.spans.titleSpan, start: owner.spans.titleSpan.end }, ` ${text}`);
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
 * Past the last thing written on the declaration line — the title, or whichever
 * annotation sits furthest along it.
 *
 * Where a *new* tag run goes. `setAnnotation` writes straight after the title
 * instead, which is right for the one-of-a-kind annotations: `#id` and
 * `~status` are what a reader looks for first, so they stay next to the words.
 * Tags are the open-ended part and belong after them, for the same reason a
 * list of labels goes at the end of a line rather than in the middle of one.
 */
function annotationsEnd(owner: Spanned): number {
	const { titleSpan, annotations, tagSpans } = owner.spans;
	const spans = [annotations.release, annotations.ticket, annotations.status, ...tagSpans];
	return spans.reduce((end, span) => (span !== null && span.end > end ? span.end : end), titleSpan.end);
}

/**
 * The tags on a card, rewritten as one run.
 *
 * Not a `setAnnotation` case, because there is no single span to replace: tags
 * are the one annotation a card may carry several of, and they need not be
 * written next to each other. So the run is rewritten *where the first tag
 * already is* and the rest are struck out — which keeps a hand-written
 * `+legal #CLONB-42 +risk` from having its ticket rewritten out of the middle,
 * and leaves the ticket exactly where its author put it.
 *
 * A card with no tags yet gets the run appended past everything else on the
 * line. Clearing the last tag takes the space in front of it too.
 */
function setTagsOn(source: string, owner: Spanned | undefined, tags: readonly string[]): string {
	if (owner === undefined) return source;

	const written = tags.map((tag) => `+${quoteIfNeeded(tag)}`).join(' ');
	const spans = owner.spans.tagSpans;

	if (spans.length === 0) {
		if (written === '') return source;
		const at = annotationsEnd(owner);
		return splice(source, { ...owner.spans.titleSpan, start: at, end: at }, ` ${written}`);
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
 * `+tags` on whichever card owns them.
 *
 * Takes the resolved node rather than a position, like `setNotes` and unlike
 * everything around it. Both are gestures every kind of card shares, so the
 * caller has already had to work out which node it is holding — asking it to
 * hand over a rule index or an `ExampleAt` instead would mean four exports
 * here and a `switch` at the other end to choose between them.
 *
 * The list is written whole rather than one tag added or removed at a time. A
 * tag editor hands back the set it ended with, and reconciling that against the
 * file tag by tag would be several splices where one does.
 */
export function setTags(
	source: string,
	d: ExampleMapDocument,
	owner: Spanned | undefined,
	tags: readonly string[],
): string {
	return unwritable(d) ? source : setTagsOn(source, owner, tags);
}

/**
 * `~status` on the story, and `open` removes the annotation.
 *
 * Open is what a story is unless somebody says otherwise, so spelling it out
 * would be noise on the common case and the two parse to the same card.
 */
export function setStoryStatus(source: string, d: ExampleMapDocument, status: StoryStatus): string {
	if (unwritable(d) || d.story === null) return source;
	return setAnnotation(source, d.story, 'status', status === 'open' ? null : `~${status}`);
}

export function setStoryTicket(source: string, d: ExampleMapDocument, ticket: string | null): string {
	if (unwritable(d) || d.story === null) return source;
	return setAnnotation(source, d.story, 'ticket', ticket === null ? null : `#${quoteIfNeeded(ticket)}`);
}

/** `@delivery` on the story: which band it is committed to. */
export function setStoryRelease(source: string, d: ExampleMapDocument, release: string | null): string {
	if (unwritable(d) || d.story === null) return source;
	return setAnnotation(source, d.story, 'release', release === null ? null : `@${quoteIfNeeded(release)}`);
}

/** `@delivery` on an example. */
export function setExampleRelease(
	source: string,
	d: ExampleMapDocument,
	at: ExampleAt,
	release: string | null,
): string {
	if (unwritable(d)) return source;
	return setAnnotation(source, exampleAt(d, at), 'release', release === null ? null : `@${quoteIfNeeded(release)}`);
}

// ---------------------------------------------------------------------------
// Titles
// ---------------------------------------------------------------------------

const retitle = (source: string, node: Spanned | undefined, title: string): string =>
	node === undefined ? source : splice(source, node.spans.titleSpan, quote(title));

export function retitleStory(source: string, d: ExampleMapDocument, title: string): string {
	return unwritable(d) || d.story === null ? source : retitle(source, d.story, title);
}

export function retitleRule(source: string, d: ExampleMapDocument, i: number, title: string): string {
	return unwritable(d) ? source : retitle(source, ruleAt(d, i), title);
}

export function retitleExample(source: string, d: ExampleMapDocument, at: ExampleAt, title: string): string {
	return unwritable(d) ? source : retitle(source, exampleAt(d, at), title);
}

export function retitleQuestion(source: string, d: ExampleMapDocument, at: QuestionAt, title: string): string {
	return unwritable(d) ? source : retitle(source, questionAt(d, at), title);
}

/**
 * A delivery's title, and every `@` that names it.
 *
 * The one rename that is not a single splice. `@"Sprint 24"` resolves *by
 * title* — the decision that keeps ids out of the format — so renaming a band
 * without moving its references would leave every card on it pointing at a
 * delivery that no longer exists, which the parser rejects.
 */
export function retitleDelivery(source: string, d: ExampleMapDocument, i: number, title: string): string {
	const node = deliveryAt(d, i);
	if (node === undefined || unwritable(d)) return source;

	const edits: { span: Span; replacement: string }[] = [
		{ span: node.spans.titleSpan, replacement: quote(title) },
	];
	const written = `@${quoteIfNeeded(title)}`;
	if (d.story?.release === node.title && d.story.spans.annotations.release) {
		edits.push({ span: d.story.spans.annotations.release, replacement: written });
	}
	for (const rule of d.rules) {
		for (const example of rule.examples) {
			if (example.delivery !== node.title || example.spans.annotations.release === null) continue;
			edits.push({ span: example.spans.annotations.release, replacement: written });
		}
	}
	return apply(source, edits);
}

/**
 * A delivery's kind, and the estimate that cannot survive the change.
 *
 * Only a sprint is sized — the parser refuses `points` on a release — so
 * becoming a release drops the number in the same edit. The reducer this
 * replaced had the same rule and gave the reason: the alternative is a hidden
 * number that reappears if the band is switched back, which is worse than
 * losing it, because nobody would know it was still there.
 *
 * Written as one splice rather than two so it is one entry in the undo stack:
 * what the visitor did was change a kind, not change a kind and then delete an
 * estimate they never touched.
 */
export function setDeliveryKind(source: string, d: ExampleMapDocument, i: number, kind: DeliveryKind): string {
	const node = deliveryAt(d, i);
	if (node === undefined || unwritable(d)) return source;

	const edits: { span: Span; replacement: string }[] = [{ span: node.kindSpan, replacement: kind }];
	if (kind === 'release' && node.pointsSpan !== null) {
		let start = node.pointsSpan.start;
		while (start > 0 && (source[start - 1] === ' ' || source[start - 1] === '\t')) start -= 1;
		edits.push({ span: { ...node.pointsSpan, start }, replacement: '' });
	}
	return apply(source, edits);
}

/**
 * `points N`, written, replaced or taken away.
 *
 * Only a sprint is sized — the parser refuses it on a release — so this writes
 * nothing on one and the board does not offer it.
 */
export function setDeliveryPoints(
	source: string,
	d: ExampleMapDocument,
	i: number,
	points: number | null,
): string {
	const node = deliveryAt(d, i);
	if (node === undefined || unwritable(d)) return source;

	if (points === null) {
		if (node.pointsSpan === null) return source;
		let start = node.pointsSpan.start;
		while (start > 0 && (source[start - 1] === ' ' || source[start - 1] === '\t')) start -= 1;
		return splice(source, { ...node.pointsSpan, start }, '');
	}

	const written = `points ${points}`;
	if (node.pointsSpan !== null) return splice(source, node.pointsSpan, written);
	// After everything already on the head line — the ticket, if there is one.
	const after = node.spans.annotations.ticket ?? node.kindSpan;
	return splice(source, { ...after, start: after.end }, ` ${written}`);
}

// ---------------------------------------------------------------------------
// The story's own three lines
// ---------------------------------------------------------------------------

const NEED_KEYWORD: Record<NeedField, string> = { persona: 'as', want: 'want', soThat: 'so' };

export function setStoryNeed(
	source: string,
	d: ExampleMapDocument,
	field: NeedField,
	text: string,
): string {
	if (unwritable(d) || d.story === null) return source;
	const span =
		field === 'persona' ? d.story.personaSpan : field === 'want' ? d.story.wantSpan : d.story.soThatSpan;
	const value = text.trim();
	return setInside(
		source,
		d.story.spans,
		span,
		value === '' ? null : `${NEED_KEYWORD[field]} ${quote(value)}`,
	);
}

/**
 * One line inside a card's block: written, replaced, or taken away.
 *
 * A card written on a single line has to grow a block before it can hold one,
 * which is the `openBrace < 0` branch.
 */
function setInside(source: string, owner: NodeSpans, span: Span | null, line: string | null): string {
	if (span !== null) {
		return line === null ? splice(source, lineRegion(source, span), '') : splice(source, span, line);
	}
	if (line === null) return source;

	if (owner.openBrace < 0) {
		const outer = lineIndent(source, owner.span.start);
		return splice(source, { ...owner.span, start: owner.span.end }, ` {\n${outer}${INDENT}${line}\n${outer}}`);
	}

	const indent = indentInside(source, owner.openBrace);
	const close = blockEnd(source, owner.openBrace) - 1;
	const gap = /\n[ \t]*$/.test(source.slice(0, close)) ? '' : '\n';
	return splice(source, { start: close, end: close, line: 0, column: 0 }, `${gap}${indent}${line}\n`);
}

// ---------------------------------------------------------------------------
// Gherkin steps
// ---------------------------------------------------------------------------

/**
 * One step line of one example, rewritten in place.
 *
 * Each step carries its own span — see the parser — so editing the second
 * `then` rewrites that line and leaves the first alone. Empty text removes the
 * line, which is how a step is deleted: there is no separate gesture for it.
 */
export function setStep(
	source: string,
	d: ExampleMapDocument,
	at: ExampleAt,
	clause: StepClause,
	index: number,
	text: string,
): string {
	const example = exampleAt(d, at);
	if (example === undefined || unwritable(d)) return source;

	const span = example.steps[clause][index];
	const value = text.replace(/\s*\n\s*/g, ' ').trim();
	if (span === undefined) return value === '' ? source : addStep(source, d, at, clause, value);
	return value === ''
		? splice(source, lineRegion(source, span), '')
		: splice(source, span, `${clause} ${quote(value)}`);
}

/**
 * An empty step of a clause, written where that clause belongs.
 *
 * After the last step of the same clause when there is one; otherwise after the
 * last step of an earlier clause, so `given`, `when` and `then` stay in the
 * order a scenario is read in rather than the order somebody added them.
 */
export function addStep(
	source: string,
	d: ExampleMapDocument,
	at: ExampleAt,
	clause: StepClause,
	text = '',
): string {
	const example = exampleAt(d, at);
	if (example === undefined || unwritable(d)) return source;

	const line = `${clause} ${quote(text)}`;
	const before = STEP_CLAUSES.slice(0, STEP_CLAUSES.indexOf(clause) + 1);
	const anchors = before.flatMap((c) => example.steps[c]);
	const last = anchors[anchors.length - 1];

	if (last === undefined) return setInside(source, example.spans, null, line);
	const indent = lineIndent(source, last.start);
	const region = lineRegion(source, last);
	return splice(source, { ...region, start: region.end, end: region.end }, `${indent}${line}\n`);
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

/** The `note` lines on a card, rewritten wholesale. */
export function setNotes(
	source: string,
	d: ExampleMapDocument,
	owner: Spanned | undefined,
	text: string,
): string {
	if (owner === undefined || unwritable(d)) return source;
	const notes = text
		.split('\n\n')
		.map((note) => note.trim())
		.filter((note) => note !== '');

	if (owner.spans.notesSpan !== null) {
		if (notes.length === 0) return splice(source, lineRegion(source, owner.spans.notesSpan), '');
		const indent = lineIndent(source, owner.spans.notesSpan.start);
		return splice(
			source,
			owner.spans.notesSpan,
			notes.map((note) => `note ${quote(note)}`).join(`\n${indent}`),
		);
	}

	if (notes.length === 0) return source;
	return notes
		.slice()
		.reverse()
		.reduce((acc, note) => setInside(acc, owner.spans, null, `note ${quote(note)}`), source);
}

// ---------------------------------------------------------------------------
// Adding and removing
// ---------------------------------------------------------------------------

/** A title nothing is using, so adding twice does not collide. */
export function unusedTitle(taken: readonly string[], base: string): string {
	const used = new Set(taken);
	if (!used.has(base)) return base;
	for (let n = 2; ; n += 1) if (!used.has(`${base} ${n}`)) return `${base} ${n}`;
}

export function addRule(source: string, d: ExampleMapDocument, index: number): string {
	if (unwritable(d) || d.openBrace < 0) return source;
	const indent = indentInside(source, d.openBrace);
	const title = unusedTitle(d.rules.map((r) => r.title), 'New rule');
	return insertAmong(source, d.rules, index, `${indent}rule ${quote(title)} {\n${indent}}\n`, d.openBrace);
}

export function addExample(
	source: string,
	d: ExampleMapDocument,
	ruleIndex: number,
	release: string | null,
): string {
	const rule = ruleAt(d, ruleIndex);
	if (rule === undefined || unwritable(d)) return source;
	const title = unusedTitle(rule.examples.map((e) => e.title), 'New example');
	const band = release === null ? '' : ` @${quoteIfNeeded(release)}`;
	return insertInside(source, rule.spans, rule.examples, rule.examples.length, `example ${quote(title)}${band}`);
}

export function addQuestion(source: string, d: ExampleMapDocument, parent: number | 'story'): string {
	if (unwritable(d)) return source;
	const owner = parent === 'story' ? d.story : ruleAt(d, parent);
	if (!owner) return source;
	const questions = parent === 'story' ? (d.story?.questions ?? []) : (ruleAt(d, parent)?.questions ?? []);
	const title = unusedTitle(questions.map((q) => q.title), 'New question');
	return insertInside(source, owner.spans, questions, questions.length, `question ${quote(title)}`);
}

export function addDelivery(
	source: string,
	d: ExampleMapDocument,
	kind: DeliveryKind,
	index: number,
): string {
	if (unwritable(d) || d.openBrace < 0) return source;
	const indent = indentInside(source, d.openBrace);
	const title = unusedTitle(d.deliveries.map((x) => x.title), kind === 'sprint' ? 'New sprint' : 'New release');
	return insertAmong(source, d.deliveries, index, `${indent}delivery ${quote(title)} ${kind}\n`, d.openBrace);
}

/** A `story "…"` line for a map that has none. */
export function addStory(source: string, d: ExampleMapDocument, title: string): string {
	if (unwritable(d) || d.story !== null || d.openBrace < 0) return source;
	const indent = indentInside(source, d.openBrace);
	const written = `${indent}story ${quote(title)}\n`;
	// Above the rules, which is where the format puts it: the story is what they
	// are rules about.
	const first = d.rules[0] ?? d.deliveries[0];
	if (first !== undefined) {
		const region = lineRegion(source, first.spans.span);
		return splice(source, { ...region, end: region.start }, `${written}\n`);
	}
	const close = blockEnd(source, d.openBrace) - 1;
	const gap = /\n[ \t]*$/.test(source.slice(0, close)) ? '' : '\n';
	return splice(source, { start: close, end: close, line: 0, column: 0 }, `${gap}${written}`);
}

function insertAmong(
	source: string,
	siblings: readonly Spanned[],
	index: number,
	block: string,
	openBrace: number,
): string {
	const before = siblings[index];
	if (before !== undefined) {
		const region = lineRegion(source, before.spans.span);
		return splice(source, { ...region, end: region.start }, `${block}\n`);
	}
	const last = siblings[siblings.length - 1];
	if (last !== undefined) {
		const region = lineRegion(source, last.spans.span);
		return splice(source, { ...region, start: region.end, end: region.end }, `\n${block}`);
	}
	if (openBrace < 0) return source;
	const close = blockEnd(source, openBrace) - 1;
	const gap = /\n[ \t]*$/.test(source.slice(0, close)) ? '' : '\n';
	return splice(source, { start: close, end: close, line: 0, column: 0 }, `${gap}${block}`);
}

function insertInside(
	source: string,
	owner: NodeSpans,
	siblings: readonly Spanned[],
	index: number,
	text: string,
): string {
	if (owner.openBrace < 0) {
		const outer = lineIndent(source, owner.span.start);
		const inner = outer + INDENT;
		return splice(
			source,
			{ ...owner.span, start: owner.span.end },
			` {\n${inner}${text.replace(/\n/g, `\n${inner}`)}\n${outer}}`,
		);
	}

	const indent = indentInside(source, owner.openBrace);
	const written = `${indent}${text.replace(/\n/g, `\n${indent}`)}\n`;
	const before = siblings[index];
	if (before !== undefined) {
		const region = lineRegion(source, before.spans.span);
		return splice(source, { ...region, end: region.start }, written);
	}
	const last = siblings[siblings.length - 1];
	if (last !== undefined) {
		const region = lineRegion(source, last.spans.span);
		return splice(source, { ...region, start: region.end, end: region.end }, written);
	}
	const close = blockEnd(source, owner.openBrace) - 1;
	const gap = /\n[ \t]*$/.test(source.slice(0, close)) ? '' : '\n';
	return splice(source, { start: close, end: close, line: 0, column: 0 }, `${gap}${written}`);
}

const removeNode = (source: string, node: Spanned | undefined): string =>
	node === undefined ? source : splice(source, lineRegion(source, node.spans.span), '');

export function removeRule(source: string, d: ExampleMapDocument, i: number): string {
	return unwritable(d) ? source : removeNode(source, ruleAt(d, i));
}

export function removeExample(source: string, d: ExampleMapDocument, at: ExampleAt): string {
	return unwritable(d) ? source : removeNode(source, exampleAt(d, at));
}

export function removeQuestion(source: string, d: ExampleMapDocument, at: QuestionAt): string {
	return unwritable(d) ? source : removeNode(source, questionAt(d, at));
}

/**
 * A delivery, and the `@` on every card that named it.
 *
 * The cards stay; they fall to unscheduled, which is where a card with no band
 * belongs. Leaving the annotations pointing at a delivery that no longer exists
 * would be a parse error.
 */
export function removeDelivery(source: string, d: ExampleMapDocument, i: number): string {
	const node = deliveryAt(d, i);
	if (node === undefined || unwritable(d)) return source;

	const edits: { span: Span; replacement: string }[] = [
		{ span: lineRegion(source, node.spans.span), replacement: '' },
	];
	const strip = (span: Span) => {
		let start = span.start;
		while (start > 0 && (source[start - 1] === ' ' || source[start - 1] === '\t')) start -= 1;
		edits.push({ span: { ...span, start }, replacement: '' });
	};
	if (d.story?.release === node.title && d.story.spans.annotations.release) {
		strip(d.story.spans.annotations.release);
	}
	for (const rule of d.rules) {
		for (const example of rule.examples) {
			if (example.delivery === node.title && example.spans.annotations.release) {
				strip(example.spans.annotations.release);
			}
		}
	}
	return apply(source, edits);
}

// ---------------------------------------------------------------------------
// Moving
// ---------------------------------------------------------------------------

/** Applied right to left, so no offset is stale by the time it is used. */
function apply(source: string, edits: readonly { span: Span; replacement: string }[]): string {
	return [...edits]
		.sort((a, b) => b.span.start - a.span.start)
		.reduce((text, e) => splice(text, e.span, e.replacement), source);
}

function anchorAmong(
	source: string,
	siblings: readonly Spanned[],
	skip: number,
	to: number,
	openBrace: number,
): number | null {
	const others = siblings.filter((_, i) => i !== skip);
	const before = others[to];
	if (before !== undefined) return lineRegion(source, before.spans.span).start;
	const last = others[others.length - 1];
	if (last !== undefined) return lineRegion(source, last.spans.span).end;
	return openBrace < 0 ? null : blockEnd(source, openBrace) - 1;
}

function relocate(source: string, from: Span, anchor: number, text?: string): string {
	const region = lineRegion(source, from);
	return apply(source, [
		{ span: region, replacement: '' },
		{
			span: { start: anchor, end: anchor, line: 0, column: 0 },
			replacement: text ?? source.slice(region.start, region.end),
		},
	]);
}

export function moveRule(source: string, d: ExampleMapDocument, from: number, to: number): string {
	const node = ruleAt(d, from);
	if (node === undefined || unwritable(d) || from === to) return source;
	const anchor = anchorAmong(source, d.rules, from, to, d.openBrace);
	return anchor === null ? source : relocate(source, node.spans.span, anchor);
}

export function moveDelivery(source: string, d: ExampleMapDocument, from: number, to: number): string {
	const node = deliveryAt(d, from);
	if (node === undefined || unwritable(d) || from === to) return source;
	const anchor = anchorAmong(source, d.deliveries, from, to, d.openBrace);
	return anchor === null ? source : relocate(source, node.spans.span, anchor);
}

/**
 * An example dragged to another square: another rule, another band, or both.
 *
 * The band is `@delivery` on the example's own line, so a move across the
 * timeline rewrites that annotation; a move to another rule relocates the
 * declaration. The annotation is rewritten **inside the extracted text**, not in
 * the source, so this function never does arithmetic on offsets that its own
 * first edit has already moved.
 */
export function moveExample(
	source: string,
	d: ExampleMapDocument,
	at: ExampleAt,
	toRule: number,
	index: number,
	release: string | null,
): string {
	const node = exampleAt(d, at);
	const target = ruleAt(d, toRule);
	if (node === undefined || target === undefined || unwritable(d)) return source;

	const region = lineRegion(source, node.spans.span);
	const skip = at.rule === toRule ? at.example : -1;
	const anchor = anchorAmong(source, target.examples, skip, index, target.spans.openBrace);
	if (anchor === null) return source;

	const local = (span: Span): Span => ({
		...span,
		start: span.start - region.start,
		end: span.end - region.start,
	});

	let block = source.slice(region.start, region.end);
	const band = release === null ? null : `@${quoteIfNeeded(release)}`;
	const written = node.spans.annotations.release;

	if (written !== null) {
		const span = local(written);
		if (band === null) {
			let from = span.start;
			while (from > 0 && (block[from - 1] === ' ' || block[from - 1] === '\t')) from -= 1;
			block = block.slice(0, from) + block.slice(span.end);
		} else {
			block = block.slice(0, span.start) + band + block.slice(span.end);
		}
	} else if (band !== null) {
		const after = local(node.spans.titleSpan).end;
		block = `${block.slice(0, after)} ${band}${block.slice(after)}`;
	}

	const indent = indentInside(source, target.spans.openBrace);
	return relocate(source, node.spans.span, anchor, reindentBlock(block, lineIndent(source, node.spans.span.start), indent));
}

/** A question moved between a rule and the story, or within one. */
export function moveQuestion(
	source: string,
	d: ExampleMapDocument,
	at: QuestionAt,
	to: number | 'story',
	index: number,
): string {
	const node = questionAt(d, at);
	const target = to === 'story' ? d.story : ruleAt(d, to);
	if (node === undefined || !target || unwritable(d)) return source;

	const siblings = to === 'story' ? (d.story?.questions ?? []) : (ruleAt(d, to)?.questions ?? []);
	const skip = at.rule === to ? at.question : -1;
	const anchor = anchorAmong(source, siblings, skip, index, target.spans.openBrace);
	if (anchor === null) return source;

	const region = lineRegion(source, node.spans.span);
	const indent = indentInside(source, target.spans.openBrace);
	const block = reindentBlock(
		source.slice(region.start, region.end),
		lineIndent(source, node.spans.span.start),
		indent,
	);
	return relocate(source, node.spans.span, anchor, block);
}

/** Shift a block from one indentation to another, first line included. */
function reindentBlock(block: string, from: string, to: string): string {
	if (from === to) return block;
	return block
		.split('\n')
		.map((line, index) => {
			if (line.trim() === '') return line;
			if (index === 0) return to + line.trimStart();
			return line.startsWith(from) ? to + line.slice(from.length) : line;
		})
		.join('\n');
}
