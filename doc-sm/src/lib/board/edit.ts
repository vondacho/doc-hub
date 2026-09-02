/**
 * Every gesture on the board, as an edit to the source text.
 *
 * ba-ddd-mapper's `src/lib/graph/edit.ts`, one notation across, and doc-es's
 * `edit.ts` one grammar richer. The rule is the same and it is the reason this
 * module exists: **the file is the artefact**, so a drag replaces the bytes it
 * is actually about and everything else — comments, blank lines, somebody's own
 * alignment — comes back untouched.
 *
 * Nothing here parses and nothing here validates. Each function takes the
 * source, the document last parsed from it, and the gesture; it hands back a new
 * string. The board re-parses, and the problems panel says what happened.
 *
 * ## Positions, not identities
 *
 * A card is addressed by where it is written — an activity index, a step index,
 * a story index. See `convert.ts` for why the board has no other kind of
 * identity to offer. Every function resolves the position against the document
 * it was handed, so a position from a *stale* document is refused rather than
 * applied to whatever now sits at that index: each one returns the source
 * unchanged when it does not resolve.
 *
 * ## Annotations are three separate spans
 *
 * `@release`, `#ticket` and `~status` sit on one line and are edited
 * independently, so each carries its own span and each of the three below is a
 * splice over that span alone. Setting a story's status does not disturb the
 * ticket next to it, and clearing one removes exactly its own sigil.
 */

import {
	type ActivityNode,
	type AnnotationSpans,
	type DeliveryKind,
	type DeliveryNode,
	type Span,
	type StepNode,
	type StoryMapDocument,
	type StoryNode,
	type StoryStatus,
} from '../storymap/model.ts';
import { quoteIfNeeded } from '../storymap/parser.ts';
import { blockEnd, indentInside, INDENT, lineIndent, lineRegion, quote, splice, spliceAll } from './source.ts';

/** Where a step is written. */
export interface StepAt {
	readonly activity: number;
	readonly step: number;
}

/** Where a story is written. */
export interface StoryAt extends StepAt {
	readonly story: number;
}

const activityAt = (d: StoryMapDocument, i: number): ActivityNode | undefined => d.activities[i];
const stepAt = (d: StoryMapDocument, at: StepAt): StepNode | undefined =>
	d.activities[at.activity]?.steps[at.step];
const storyAt = (d: StoryMapDocument, at: StoryAt): StoryNode | undefined =>
	d.activities[at.activity]?.steps[at.step]?.stories[at.story];
const deliveryAt = (d: StoryMapDocument, i: number): DeliveryNode | undefined => d.deliveries[i];

/**
 * Whether this document can be spliced at all.
 *
 * A document that was never parsed from anything carries no source and every
 * span points at offset zero. Splicing one would write to the top of whatever
 * text happened to be on screen.
 */
const unwritable = (d: StoryMapDocument): boolean => d.source === '';

// ---------------------------------------------------------------------------
// The map
// ---------------------------------------------------------------------------

export function setMapTitle(source: string, d: StoryMapDocument, title: string): string {
	if (unwritable(d)) return source;
	return splice(source, d.titleSpan, quote(title));
}

export function setProduct(source: string, d: StoryMapDocument, product: string | null): string {
	return setHeaderLine(source, d, 'product', product, d.productSpan);
}

export function setSpace(source: string, d: StoryMapDocument, space: string | null): string {
	return setHeaderLine(source, d, 'space', space, d.spaceSpan);
}

/**
 * `product "…"` / `space "…"`, written, replaced or taken away.
 *
 * Three cases rather than one, because the line may not be there: a map that is
 * not about a registered product has no `product` line at all, and clearing the
 * picker has to remove the line rather than write `product ""`.
 */
function setHeaderLine(
	source: string,
	d: StoryMapDocument,
	keyword: 'product' | 'space',
	value: string | null,
	span: Span | null,
): string {
	if (unwritable(d)) return source;

	if (value === null) {
		if (span === null) return source;
		return splice(source, lineRegion(source, span), '');
	}

	const line = `${keyword} ${quote(value)}`;
	if (span !== null) return splice(source, span, line);

	// Written under whichever of the two is already there, so adding the second
	// does not jump over the first.
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
// Annotations: @release, #ticket, ~status
// ---------------------------------------------------------------------------

/**
 * One annotation, set or cleared, on whatever card owns it.
 *
 * Written straight after the card's title when it is not already there, which
 * is where every one of them is written by hand and by the sample. Anywhere
 * else would be legal and would read as though the tool had put it somewhere
 * odd.
 */
function setAnnotation(
	source: string,
	d: StoryMapDocument,
	owner: { readonly titleSpan: Span; readonly annotations: AnnotationSpans } | undefined,
	which: keyof AnnotationSpans,
	text: string | null,
): string {
	if (owner === undefined || unwritable(d)) return source;
	const span = owner.annotations[which];

	if (text === null) {
		if (span === null) return source;
		return splice(source, withGap(source, span), '');
	}

	if (span !== null) return splice(source, span, text);
	return splice(source, { ...owner.titleSpan, start: owner.titleSpan.end }, ` ${text}`);
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

/** Everything writing a tag run needs from a node, whatever kind it is. */
type Tagged = {
	readonly titleSpan: Span;
	readonly annotations: AnnotationSpans;
	readonly tagSpans: readonly Span[];
};

/**
 * Past the last thing written on the declaration line — the title, or whichever
 * annotation sits furthest along it.
 *
 * Where a *new* tag run goes. `setAnnotation` writes straight after the title
 * instead, which is right for the one-of-a-kind annotations: `#id`, `~status`
 * and `@release` are what a reader looks for first, so they stay next to the
 * words. Tags are the open-ended part and belong after them, for the same
 * reason a list of labels goes at the end of a line rather than the middle.
 */
function annotationsEnd(owner: Tagged): number {
	const spans = [owner.annotations.release, owner.annotations.ticket, owner.annotations.status, ...owner.tagSpans];
	return spans.reduce((end, span) => (span !== null && span.end > end ? span.end : end), owner.titleSpan.end);
}

/**
 * `+tags` on whichever card owns them, rewritten as one run.
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
 *
 * Takes the resolved node rather than a position, like `setNotes` and unlike
 * everything around it: both are gestures every kind of card shares, so the
 * caller has already worked out which node it is holding, and asking for a
 * `StoryAt` or a step index instead would mean three exports here and a
 * `switch` at the other end to choose between them.
 */
export function setTags(
	source: string,
	d: StoryMapDocument,
	owner: Tagged | undefined,
	tags: readonly string[],
): string {
	if (owner === undefined || unwritable(d)) return source;

	const written = tags.map((tag) => `+${quoteIfNeeded(tag)}`).join(' ');
	const spans = owner.tagSpans;

	if (spans.length === 0) {
		if (written === '') return source;
		const at = annotationsEnd(owner);
		return splice(source, { ...owner.titleSpan, start: at, end: at }, ` ${written}`);
	}

	const [first, ...rest] = spans as readonly Span[] as [Span, ...Span[]];
	return spliceAll(source, [
		// Every tag after the first goes whatever happens to the first, because
		// the run is rewritten whole and leaving the old ones would double them.
		...rest.map((span) => ({ span: withGap(source, span), replacement: '' })),
		{ span: written === '' ? withGap(source, first) : first, replacement: written },
	]);
}

export function setStoryRelease(
	source: string,
	d: StoryMapDocument,
	at: StoryAt,
	release: string | null,
): string {
	return setAnnotation(
		source,
		d,
		storyAt(d, at),
		'release',
		release === null ? null : `@${quoteIfNeeded(release)}`,
	);
}

export function setTicket(
	source: string,
	d: StoryMapDocument,
	owner: { readonly titleSpan: Span; readonly annotations: AnnotationSpans } | undefined,
	ticket: string | null,
): string {
	return setAnnotation(source, d, owner, 'ticket', ticket === null ? null : `#${quoteIfNeeded(ticket)}`);
}

/**
 * `~status`, and `open` removes the annotation rather than writing it.
 *
 * Open is what a card is unless somebody says otherwise — the parser defaults to
 * it — so spelling it out would be noise on the common case, and the two parse
 * to the same card. The same rule doc-es keeps for `level big-picture`.
 */
export function setStatus(
	source: string,
	d: StoryMapDocument,
	owner: { readonly titleSpan: Span; readonly annotations: AnnotationSpans } | undefined,
	status: StoryStatus,
): string {
	return setAnnotation(source, d, owner, 'status', status === 'open' ? null : `~${status}`);
}

/** The card at a position, whatever kind it is — for the annotation setters. */
export function cardAt(
	d: StoryMapDocument,
	kind: 'activity' | 'step' | 'story',
	at: StoryAt,
): { readonly titleSpan: Span; readonly annotations: AnnotationSpans } | undefined {
	if (kind === 'activity') return activityAt(d, at.activity);
	if (kind === 'step') return stepAt(d, at);
	return storyAt(d, at);
}

// ---------------------------------------------------------------------------
// Titles
// ---------------------------------------------------------------------------

export function retitleActivity(source: string, d: StoryMapDocument, i: number, title: string): string {
	const node = activityAt(d, i);
	return node === undefined || unwritable(d) ? source : splice(source, node.titleSpan, quote(title));
}

export function retitleStep(source: string, d: StoryMapDocument, at: StepAt, title: string): string {
	const node = stepAt(d, at);
	return node === undefined || unwritable(d) ? source : splice(source, node.titleSpan, quote(title));
}

export function retitleStory(source: string, d: StoryMapDocument, at: StoryAt, title: string): string {
	const node = storyAt(d, at);
	return node === undefined || unwritable(d) ? source : splice(source, node.titleSpan, quote(title));
}

/**
 * A delivery's title, and every `@release` that names it.
 *
 * The one rename that is not a single splice. `@MVP` resolves *by title* — that
 * is the decision that keeps ids out of the format — so renaming a band without
 * moving its references would leave every story on it pointing at a release
 * that no longer exists, which the parser rejects. The rename moves them
 * together or not at all.
 */
export function retitleDelivery(source: string, d: StoryMapDocument, i: number, title: string): string {
	const node = deliveryAt(d, i);
	if (node === undefined || unwritable(d)) return source;

	const edits: { span: Span; replacement: string }[] = [
		{ span: node.titleSpan, replacement: quote(title) },
	];
	for (const activity of d.activities) {
		for (const step of activity.steps) {
			for (const story of step.stories) {
				if (story.release !== node.title || story.annotations.release === null) continue;
				edits.push({ span: story.annotations.release, replacement: `@${quoteIfNeeded(title)}` });
			}
		}
	}

	return edits
		.sort((a, b) => b.span.start - a.span.start)
		.reduce((text, e) => splice(text, e.span, e.replacement), source);
}

export function setDeliveryKind(
	source: string,
	d: StoryMapDocument,
	i: number,
	kind: DeliveryKind,
): string {
	const node = deliveryAt(d, i);
	if (node === undefined || unwritable(d)) return source;
	// On the old `release "MVP"` spelling the keyword *is* the kind, so this
	// rewrites `release` in place and the line becomes the new spelling.
	const written = source.slice(node.kindSpan.start, node.kindSpan.end);
	return written === 'release' && node.kindSpan.start === node.span.start
		? splice(source, { ...node.span, end: node.titleSpan.end }, `delivery ${quote(node.title)} ${kind}`)
		: splice(source, node.kindSpan, kind);
}

// ---------------------------------------------------------------------------
// The story's own three lines
// ---------------------------------------------------------------------------

export function setPersona(
	source: string,
	d: StoryMapDocument,
	at: StoryAt,
	persona: string | null,
): string {
	const story = storyAt(d, at);
	if (story === undefined || unwritable(d)) return source;
	return setInside(source, story, story.personaSpan, persona === null ? null : `as ${quote(persona)}`);
}

export function setNeed(
	source: string,
	d: StoryMapDocument,
	at: StoryAt,
	field: 'want' | 'soThat',
	text: string,
): string {
	const story = storyAt(d, at);
	if (story === undefined || unwritable(d)) return source;
	const span = field === 'want' ? story.wantSpan : story.soThatSpan;
	const keyword = field === 'want' ? 'want' : 'so';
	const value = text.trim();
	return setInside(source, story, span, value === '' ? null : `${keyword} ${quote(value)}`);
}

/**
 * One line inside a card's block: written, replaced, or taken away.
 *
 * A card written on a single line has to grow a block before it can hold one,
 * which is the `openBrace < 0` branch. Everything else is a splice.
 */
function setInside(
	source: string,
	owner: { readonly span: Span; readonly openBrace: number },
	span: Span | null,
	line: string | null,
): string {
	if (span !== null) {
		return line === null
			? splice(source, lineRegion(source, span), '')
			: splice(source, span, line);
	}
	if (line === null) return source;

	if (owner.openBrace < 0) {
		const outer = lineIndent(source, owner.span.start);
		return splice(
			source,
			{ ...owner.span, start: owner.span.end },
			` {\n${outer}${INDENT}${line}\n${outer}}`,
		);
	}

	const indent = indentInside(source, owner.openBrace);
	const close = blockEnd(source, owner.openBrace) - 1;
	const gap = /\n[ \t]*$/.test(source.slice(0, close)) ? '' : '\n';
	return splice(source, { start: close, end: close, line: 0, column: 0 }, `${gap}${indent}${line}\n`);
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

/**
 * The `note` lines on a card, rewritten wholesale.
 *
 * Wholesale because the panel edits them as one block of text: what arrives is
 * the whole of what the notes should now say, and diffing it against the lines
 * that were there to produce a minimal splice would be a great deal of work to
 * make one textarea's edit look tidier in a diff it is already the subject of.
 */
export function setNotes(
	source: string,
	d: StoryMapDocument,
	owner: { readonly span: Span; readonly openBrace: number; readonly notesSpan: Span | null } | undefined,
	text: string,
): string {
	if (owner === undefined || unwritable(d)) return source;
	const notes = text
		.split('\n\n')
		.map((note) => note.trim())
		.filter((note) => note !== '');

	if (owner.notesSpan !== null) {
		if (notes.length === 0) return splice(source, lineRegion(source, owner.notesSpan), '');
		const indent = lineIndent(source, owner.notesSpan.start);
		return splice(
			source,
			owner.notesSpan,
			notes.map((note) => `note ${quote(note)}`).join(`\n${indent}`),
		);
	}

	if (notes.length === 0) return source;
	return notes
		.slice()
		.reverse()
		.reduce((text_, note) => setInside(text_, owner, null, `note ${quote(note)}`), source);
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

export function addActivity(source: string, d: StoryMapDocument, index: number): string {
	if (unwritable(d) || d.openBrace < 0) return source;
	const indent = indentInside(source, d.openBrace);
	const title = unusedTitle(d.activities.map((a) => a.title), 'New activity');
	const block = `${indent}activity ${quote(title)} {\n${indent}}\n`;
	return insertAmong(source, d, d.activities, index, block, d.openBrace);
}

export function addStep(source: string, d: StoryMapDocument, activityIndex: number, index: number): string {
	const activity = activityAt(d, activityIndex);
	if (activity === undefined || unwritable(d)) return source;
	const title = unusedTitle(activity.steps.map((s) => s.title), 'New step');
	return insertInside(source, activity, activity.steps, index, `step ${quote(title)} {\n}`);
}

export function addStory(
	source: string,
	d: StoryMapDocument,
	at: StepAt,
	index: number,
	release: string | null,
): string {
	const step = stepAt(d, at);
	if (step === undefined || unwritable(d)) return source;
	const title = unusedTitle(step.stories.map((s) => s.title), 'New story');
	const band = release === null ? '' : ` @${quoteIfNeeded(release)}`;
	return insertInside(source, step, step.stories, index, `story ${quote(title)}${band}`);
}

export function addDelivery(
	source: string,
	d: StoryMapDocument,
	kind: DeliveryKind,
	index: number,
): string {
	if (unwritable(d) || d.openBrace < 0) return source;
	const indent = indentInside(source, d.openBrace);
	const title = unusedTitle(d.deliveries.map((x) => x.title), kind === 'sprint' ? 'New sprint' : 'New release');
	const block = `${indent}delivery ${quote(title)} ${kind}\n`;
	return insertAmong(source, d, d.deliveries, index, block, d.openBrace);
}

/** Written among the map's own children, at a row. */
function insertAmong(
	source: string,
	d: StoryMapDocument,
	siblings: readonly { readonly span: Span }[],
	index: number,
	block: string,
	openBrace: number,
): string {
	const before = siblings[index];
	if (before !== undefined) {
		const region = lineRegion(source, before.span);
		return splice(source, { ...region, end: region.start }, `${block}\n`);
	}
	const last = siblings[siblings.length - 1];
	if (last !== undefined) {
		const region = lineRegion(source, last.span);
		return splice(source, { ...region, start: region.end, end: region.end }, `\n${block}`);
	}
	if (openBrace < 0) return source;
	const close = blockEnd(source, openBrace) - 1;
	const gap = /\n[ \t]*$/.test(source.slice(0, close)) ? '' : '\n';
	return splice(source, { start: close, end: close, line: 0, column: 0 }, `${gap}${block}`);
}

/** Written inside a card's block, among its own children. */
function insertInside(
	source: string,
	owner: { readonly span: Span; readonly openBrace: number },
	siblings: readonly { readonly span: Span }[],
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
		const region = lineRegion(source, before.span);
		return splice(source, { ...region, end: region.start }, written);
	}
	const last = siblings[siblings.length - 1];
	if (last !== undefined) {
		const region = lineRegion(source, last.span);
		return splice(source, { ...region, start: region.end, end: region.end }, written);
	}
	const close = blockEnd(source, owner.openBrace) - 1;
	const gap = /\n[ \t]*$/.test(source.slice(0, close)) ? '' : '\n';
	return splice(source, { start: close, end: close, line: 0, column: 0 }, `${gap}${written}`);
}

export function removeActivity(source: string, d: StoryMapDocument, i: number): string {
	const node = activityAt(d, i);
	return node === undefined || unwritable(d) ? source : splice(source, lineRegion(source, node.span), '');
}

export function removeStep(source: string, d: StoryMapDocument, at: StepAt): string {
	const node = stepAt(d, at);
	return node === undefined || unwritable(d) ? source : splice(source, lineRegion(source, node.span), '');
}

export function removeStory(source: string, d: StoryMapDocument, at: StoryAt): string {
	const node = storyAt(d, at);
	return node === undefined || unwritable(d) ? source : splice(source, lineRegion(source, node.span), '');
}

/**
 * A delivery, and the `@release` on every story that named it.
 *
 * The stories stay; they fall below the line, which is where an unassigned
 * story belongs. Leaving the annotations pointing at a band that no longer
 * exists would be a parse error, so removing the band removes them too.
 */
export function removeDelivery(source: string, d: StoryMapDocument, i: number): string {
	const node = deliveryAt(d, i);
	if (node === undefined || unwritable(d)) return source;

	const edits: { span: Span; replacement: string }[] = [
		{ span: lineRegion(source, node.span), replacement: '' },
	];
	for (const activity of d.activities) {
		for (const step of activity.steps) {
			for (const story of step.stories) {
				if (story.release !== node.title || story.annotations.release === null) continue;
				const span = story.annotations.release;
				let start = span.start;
				while (start > 0 && (source[start - 1] === ' ' || source[start - 1] === '\t')) start -= 1;
				edits.push({ span: { ...span, start }, replacement: '' });
			}
		}
	}

	return edits
		.sort((a, b) => b.span.start - a.span.start)
		.reduce((text, e) => splice(text, e.span, e.replacement), source);
}

// ---------------------------------------------------------------------------
// Moving
// ---------------------------------------------------------------------------

/**
 * The `persona` lines a target activity needs before a story may live in it.
 *
 * A story's `as "Business analyst"` resolves against **its own activity's**
 * persona list — see `resolvePersona` in the parser — so a story dragged to an
 * activity that does not list its persona makes the file invalid. The cast
 * travels with the story.
 *
 * This was a real bug before the text became the document, and an invisible
 * one: the old reducer moved the story, the board looked right, and the damage
 * only appeared when somebody exported the file and tried to open it again.
 * Now the parser sees it a keystroke later, so it had to be fixed rather than
 * deferred.
 *
 * Carried rather than dropped, because dropping loses what the author said.
 * The parser's own hint for this error is "add one to it", which is what this
 * does — and an unwanted persona line is one keystroke to delete, where a lost
 * one is gone.
 */
function carryPersonas(
	source: string,
	target: ActivityNode,
	wanted: readonly (string | null)[],
): { span: Span; replacement: string }[] {
	const missing = [...new Set(wanted.filter((name): name is string => name !== null))].filter(
		(name) => !target.personas.includes(name),
	);
	if (missing.length === 0) return [];

	const written = missing.map((name) => `persona ${quote(name)}`);

	// Under the ones already there; otherwise first inside the block, which is
	// where the format puts them — who this is for, before what they do.
	if (target.personasSpan !== null) {
		const indent = lineIndent(source, target.personasSpan.start);
		return [
			{
				span: { ...target.personasSpan, start: target.personasSpan.end },
				replacement: written.map((line) => `\n${indent}${line}`).join(''),
			},
		];
	}

	if (target.openBrace < 0) return [];
	const indent = indentInside(source, target.openBrace);
	const after = target.openBrace + 1;
	return [
		{
			span: { start: after, end: after, line: 0, column: 0 },
			replacement: `\n${written.map((line) => `${indent}${line}`).join('\n')}`,
		},
	];
}

/** A declaration cut from where it is and pasted where it belongs. */
function relocate(source: string, from: Span, anchor: number, text?: string): string {
	const region = lineRegion(source, from);
	const block = text ?? source.slice(region.start, region.end);
	const edits = [
		{ span: region, replacement: '' },
		{ span: { start: anchor, end: anchor, line: 0, column: 0 }, replacement: block },
	];
	return edits
		.sort((a, b) => b.span.start - a.span.start)
		.reduce((acc, e) => splice(acc, e.span, e.replacement), source);
}

/** The offset a sibling moved to `to` should be written at. */
function anchorAmong(
	source: string,
	siblings: readonly { readonly span: Span }[],
	from: number,
	to: number,
	openBrace: number,
): number | null {
	const others = siblings.filter((_, i) => i !== from);
	const before = others[to];
	if (before !== undefined) return lineRegion(source, before.span).start;
	const last = others[others.length - 1];
	if (last !== undefined) return lineRegion(source, last.span).end;
	return openBrace < 0 ? null : blockEnd(source, openBrace) - 1;
}

export function moveActivity(source: string, d: StoryMapDocument, from: number, to: number): string {
	const node = activityAt(d, from);
	if (node === undefined || unwritable(d) || from === to) return source;
	const anchor = anchorAmong(source, d.activities, from, to, d.openBrace);
	return anchor === null ? source : relocate(source, node.span, anchor);
}

export function moveDelivery(source: string, d: StoryMapDocument, from: number, to: number): string {
	const node = deliveryAt(d, from);
	if (node === undefined || unwritable(d) || from === to) return source;
	const anchor = anchorAmong(source, d.deliveries, from, to, d.openBrace);
	return anchor === null ? source : relocate(source, node.span, anchor);
}

/**
 * A step moved within its activity, or to another one.
 *
 * The step's whole block travels — its stories, its notes and any comment
 * written between them — because what moved is the column, not a title.
 */
export function moveStep(
	source: string,
	d: StoryMapDocument,
	at: StepAt,
	toActivity: number,
	index: number,
): string {
	const node = stepAt(d, at);
	const target = activityAt(d, toActivity);
	if (node === undefined || target === undefined || unwritable(d)) return source;

	const skip = at.activity === toActivity ? at.step : -1;
	const anchor = anchorAmong(source, target.steps, skip, index, target.openBrace);
	if (anchor === null) return source;

	const region = lineRegion(source, node.span);
	const indent = indentInside(source, target.openBrace);
	const moved = reindentBlock(source.slice(region.start, region.end), lineIndent(source, node.span.start), indent);

	const edits = [
		{ span: region, replacement: '' },
		{ span: { start: anchor, end: anchor, line: 0, column: 0 }, replacement: moved },
		...(at.activity === toActivity
			? []
			: carryPersonas(source, target, node.stories.map((story) => story.persona))),
	];
	return edits
		.sort((a, b) => b.span.start - a.span.start)
		.reduce((text, e) => splice(text, e.span, e.replacement), source);
}

/**
 * A story dragged to another square: another step, another band, or both.
 *
 * The band is `@release` on the story's own line, so a move across the timeline
 * is a rewrite of that annotation; a move to another step is a relocation of the
 * declaration. A diagonal drag is both, and there is no reading under which that
 * should be two undo steps.
 *
 * The annotation is rewritten **inside the extracted text**, not in the source,
 * which is the whole reason this is simple. Editing the source first would move
 * every span after it and leave this function doing arithmetic on stale offsets
 * to find its own anchor — the sort of code that works on the sample and fails
 * on the file where the band happens to sit after the target step.
 */
export function moveStory(
	source: string,
	d: StoryMapDocument,
	at: StoryAt,
	to: StepAt,
	index: number,
	release: string | null,
): string {
	const node = storyAt(d, at);
	const target = stepAt(d, to);
	if (node === undefined || target === undefined || unwritable(d)) return source;

	const region = lineRegion(source, node.span);
	const sameStep = at.activity === to.activity && at.step === to.step;
	const skip = sameStep ? at.story : -1;
	const anchor = anchorAmong(source, target.stories, skip, index, target.openBrace);
	if (anchor === null) return source;

	// Offsets within the extracted lines rather than within the file.
	const local = (span: Span): Span => ({
		...span,
		start: span.start - region.start,
		end: span.end - region.start,
	});

	let block = source.slice(region.start, region.end);
	const band = release === null ? null : `@${quoteIfNeeded(release)}`;

	if (node.annotations.release !== null) {
		const span = local(node.annotations.release);
		if (band === null) {
			let from = span.start;
			while (from > 0 && (block[from - 1] === ' ' || block[from - 1] === '\t')) from -= 1;
			block = block.slice(0, from) + block.slice(span.end);
		} else {
			block = block.slice(0, span.start) + band + block.slice(span.end);
		}
	} else if (band !== null) {
		const after = local(node.titleSpan).end;
		block = `${block.slice(0, after)} ${band}${block.slice(after)}`;
	}

	const indent = indentInside(source, target.openBrace);
	const moved = reindentBlock(block, lineIndent(source, node.span.start), indent);

	const host = activityAt(d, to.activity);
	return [
		{ span: region, replacement: '' },
		{ span: { start: anchor, end: anchor, line: 0, column: 0 }, replacement: moved },
		...(at.activity === to.activity || host === undefined
			? []
			: carryPersonas(source, host, [node.persona])),
	]
		.sort((a, b) => b.span.start - a.span.start)
		.reduce((text, e) => splice(text, e.span, e.replacement), source);
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

// ---------------------------------------------------------------------------
// Promotions
// ---------------------------------------------------------------------------

/**
 * A story promoted to a step, written after the step it came from.
 *
 * Title and notes travel; the release does not, because a step is not in a band
 * — it spans every one of them. That is the single thing this loses, and it is
 * why the board offers the move in this direction only.
 */
export function storyToStep(source: string, d: StoryMapDocument, at: StoryAt): string {
	const story = storyAt(d, at);
	const host = stepAt(d, at);
	const activity = activityAt(d, at.activity);
	if (story === undefined || host === undefined || activity === undefined || unwritable(d)) return source;

	const indent = indentInside(source, activity.openBrace);
	const lines = [`step ${quote(story.title)}`, ...story.notes.map((note) => `${INDENT}note ${quote(note)}`)];
	const written =
		story.notes.length === 0
			? `${indent}${lines[0]}\n`
			: `${indent}${lines[0]} {\n${lines.slice(1).map((l) => indent + l).join('\n')}\n${indent}}\n`;

	const after = lineRegion(source, host.span).end;
	return [
		{ span: lineRegion(source, story.span), replacement: '' },
		{ span: { start: after, end: after, line: 0, column: 0 }, replacement: written },
	]
		.sort((a, b) => b.span.start - a.span.start)
		.reduce((text, e) => splice(text, e.span, e.replacement), source);
}

/**
 * A step promoted to an activity, taking its stories with it.
 *
 * The step becomes an activity holding a step of the same title, so the column
 * keeps its contents and nothing is lost. Its epic does not travel: a promoted
 * step is a new thing the tracker has not been told about, and the ticket stays
 * with the step it came from.
 */
export function stepToActivity(source: string, d: StoryMapDocument, at: StepAt): string {
	const step = stepAt(d, at);
	const activity = activityAt(d, at.activity);
	if (step === undefined || activity === undefined || unwritable(d)) return source;

	const outer = indentInside(source, d.openBrace);
	const region = lineRegion(source, step.span);
	const block = reindentBlock(
		source.slice(region.start, region.end).trimEnd(),
		lineIndent(source, step.span.start),
		outer + INDENT,
	);

	// The cast the stories inside it need, since the new activity has none.
	const cast = [...new Set(step.stories.map((story) => story.persona).filter((n): n is string => n !== null))];
	const personas = cast.map((name) => `${outer}${INDENT}persona ${quote(name)}`);
	const body = [...personas, block].join('\n');
	const written = `\n${outer}activity ${quote(step.title)} {\n${body}\n${outer}}\n`;

	const after = lineRegion(source, activity.span).end;
	return [
		{ span: region, replacement: '' },
		{ span: { start: after, end: after, line: 0, column: 0 }, replacement: written },
	]
		.sort((a, b) => b.span.start - a.span.start)
		.reduce((text, e) => splice(text, e.span, e.replacement), source);
}

/**
 * An empty step demoted to a story, under the step beside it.
 *
 * Only ever reachable for a step with nothing in it — the board refuses it
 * otherwise, because a story cannot hold stories — so there are no cells to
 * move. It lands below the line, having no release to claim.
 */
export function stepToStory(source: string, d: StoryMapDocument, at: StepAt): string {
	const step = stepAt(d, at);
	const activity = activityAt(d, at.activity);
	if (step === undefined || activity === undefined || unwritable(d)) return source;

	const neighbour = activity.steps[at.step - 1] ?? activity.steps[at.step + 1];
	if (neighbour === undefined) return source;

	const region = lineRegion(source, step.span);
	const anchor = anchorAmong(source, neighbour.stories, -1, neighbour.stories.length, neighbour.openBrace);
	if (anchor === null) return source;

	const indent = indentInside(source, neighbour.openBrace);
	const written = `${indent}story ${quote(step.title)}\n`;

	return [
		{ span: region, replacement: '' },
		{ span: { start: anchor, end: anchor, line: 0, column: 0 }, replacement: written },
	]
		.sort((a, b) => b.span.start - a.span.start)
		.reduce((text, e) => splice(text, e.span, e.replacement), source);
}
