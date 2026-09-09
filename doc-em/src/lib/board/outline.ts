/**
 * The map as prose: one Markdown document.
 *
 * The picture is for a deck; this is for a wiki page, a pull request, or the
 * body of a ticket — the places where a `.svg` is an attachment nobody opens
 * and an image is not searchable. It is also the only export a screen reader, a
 * `grep` or a diff can do anything with.
 *
 * ## It leads with the reading
 *
 * `reading.ts` already computes what the shape of the map is telling you —
 * many red cards means the story is not ready, a rule with no green under it is
 * a rule nobody understands yet — and on the board that appears as a panel
 * beside the cards. In a document it goes *first*, because the one thing an
 * example map is exported for is to answer "is this story ready?", and burying
 * that under four rules of prose makes the reader do the counting the tool
 * already did.
 *
 * Computed rather than copied: this calls `readMap`, so the document and the
 * panel can never disagree about the same board.
 *
 * ## Then the story, then the rules
 *
 * The document's own order, and the source pane's. Each rule carries its
 * questions and then its examples in band order, so the delivery is recoverable
 * without the timeline becoming the outline's spine — an example map is not a
 * plan, and leading with the sprints would make it look like one.
 *
 * ## Nothing is dated
 *
 * There is no "exported on" line, and it is not an oversight. An outline is the
 * export most likely to be committed beside the code it describes, and a
 * timestamp would make every regeneration a diff — the same map, a different
 * file, for no reason a reviewer can act on.
 */

import { clauseKeyword, STEP_CLAUSES, storyStatusLabel } from '../examplemap/model.ts';
import { readMap } from './reading.ts';
import {
	bands,
	examplesIn,
	UNSCHEDULED,
	type BandId,
	type BoardState,
	type Example,
	type Id,
} from './state.ts';

export interface OutlineOptions {
	/**
	 * The cards to write, or `null` for all of them. The board's `matching` set.
	 *
	 * As with the picture, a filtered-out card is left out rather than marked: a
	 * document is read for what it says, and a list of struck-through lines is a
	 * worse artefact than a shorter list with a caption saying it is one.
	 */
	readonly only: ReadonlySet<Id> | null;
}

export function boardMarkdown(board: BoardState, options: OutlineOptions): string {
	const shown = (id: Id) => options.only === null || options.only.has(id);
	const out: string[] = [`# ${escape(board.title)}`, ''];

	const facts: string[] = [];
	if (board.product !== null) facts.push(`**Product:** ${escape(board.product)}`);
	if (board.space !== null) facts.push(`**Space:** ${escape(board.space)}`);
	if (options.only !== null) {
		facts.push('**Filtered:** only the cards the board was showing when this was exported');
	}
	if (facts.length > 0) out.push(facts.join('  \n'), '');

	for (const note of board.notes) out.push(escape(note), '');

	out.push(...reading(board), ...story(board, shown), ...rules(board, shown));

	return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

/**
 * What the shape of the map says, before anybody reads a card.
 *
 * Each reading names what it saw, which is `readMap`'s own rule and the reason
 * it is worth printing: a document that said "not ready" without saying why
 * would be another opinion in the room rather than the map's account of itself.
 */
function reading(board: BoardState): readonly string[] {
	const readings = readMap(board);
	if (readings.length === 0) return [];

	const out = ['## What this map is telling you', ''];
	for (const entry of readings) {
		out.push(`- **${escape(entry.title)}** — ${escape(entry.detail)}`);
	}
	out.push('', '');
	return out;
}

function story(board: BoardState, shown: (id: Id) => boolean): readonly string[] {
	if (board.story === null) return [];
	const { story: card } = board;
	const out = [`## ${escape(card.title)}`, ''];

	const meta = cardMeta(card.ticket, card.status, card.tags);
	if (meta !== '') out.push(meta, '');

	const need = [
		card.persona === null ? null : `As ${escape(card.persona)}`,
		card.want === null ? null : `I want ${escape(card.want)}`,
		card.soThat === null ? null : `so that ${escape(card.soThat)}`,
	].filter((part): part is string => part !== null);
	if (need.length > 0) out.push(`${need.join(', ')}.`, '');

	for (const note of card.notes) out.push(escape(note), '');

	const questions = card.questions.filter(shown);
	if (questions.length > 0) {
		out.push('**Open questions about the story:**', '');
		for (const id of questions) out.push(...question(board, id));
		out.push('');
	}

	return out;
}

function rules(board: BoardState, shown: (id: Id) => boolean): readonly string[] {
	const out: string[] = [];

	for (const ruleId of board.ruleOrder) {
		const rule = board.rules[ruleId];
		if (!rule) continue;

		out.push(`## ${escape(rule.title)}`, '');
		const meta = cardMeta(null, 'open', rule.tags);
		if (meta !== '') out.push(meta, '');
		for (const note of rule.notes) out.push(escape(note), '');

		const questions = rule.questionIds.filter(shown);
		if (questions.length > 0) {
			out.push('**Open questions:**', '');
			for (const id of questions) out.push(...question(board, id));
			out.push('');
		}

		let wrote = false;
		for (const band of bands(board)) {
			for (const id of examplesIn(board, ruleId, band).filter(shown)) {
				const example = board.examples[id];
				if (!example) continue;
				wrote = true;

				out.push(`- **${escape(bandName(board, band))}** — ${escape(example.title)}`);
				const tags = example.tags.map((tag) => `\`+${escape(tag)}\``).join(' ');
				if (tags !== '') out.push(`  ${tags}`);
				// Two spaces of indent on every line, which is what keeps the steps
				// inside the list item; a line at column zero ends the list and
				// reflows every item under it into one run-on paragraph.
				for (const line of scenario(example)) out.push(`  ${escape(line)}`);
				for (const note of example.notes) {
					for (const line of note.split('\n')) out.push(`  ${escape(line)}`);
				}
			}
		}

		/*
		 * A rule with no examples is named as such, and it is the loudest line in
		 * this document.
		 *
		 * The doctrine puts it first among the things to look for: a rule nobody
		 * can illustrate is a rule nobody understands yet. An empty heading
		 * followed by the next heading would read as a document that lost
		 * something rather than as the finding it is.
		 */
		if (!wrote) out.push('*No examples. A rule nobody can illustrate is a rule nobody understands yet.*');
		out.push('');
	}

	return out;
}

/** One question, as a list item, with its own notes and tags. */
function question(board: BoardState, id: Id): readonly string[] {
	const card = board.questions[id];
	if (!card) return [];
	const out = [`- ${escape(card.title)}`];
	const tags = card.tags.map((tag) => `\`+${escape(tag)}\``).join(' ');
	if (tags !== '') out.push(`  ${tags}`);
	for (const note of card.notes) {
		for (const line of note.split('\n')) out.push(`  ${escape(line)}`);
	}
	return out;
}

/**
 * An example's steps, in Gherkin's order and with Gherkin's `And`.
 *
 * The same rendering `gherkin.ts` performs, and deliberately so: the outline
 * and the feature file are two views of one thing, and a card that read
 * "given / given" where the `.feature` reads "Given / And" would make somebody
 * checking one against the other think a step had been lost.
 *
 * An example with nothing written produces nothing rather than a skeleton. It
 * is an ordinary state — somebody named the case before anybody wrote it out —
 * and inventing `Given …` under it would put words in their mouth.
 */
function scenario(example: Example): readonly string[] {
	const lines: string[] = [];
	for (const clause of STEP_CLAUSES) {
		example[clause]
			.map((line) => line.trim())
			.filter((line) => line !== '')
			.forEach((line, index) => lines.push(`${index === 0 ? clauseKeyword[clause] : 'And'} ${line}`));
	}
	return lines;
}

function bandName(board: BoardState, band: BandId): string {
	return band === UNSCHEDULED ? 'Not scheduled' : (board.deliveries[band]?.title ?? 'Not scheduled');
}

/**
 * The ticket, the status and the tags, on one line.
 *
 * `open` on an unlinked card is dropped. It is the local placeholder for
 * "nothing has been said about this yet" — printing it would put a status on a
 * card where nobody set one, which is a document claiming more than the file
 * does.
 */
function cardMeta(ticket: string | null, status: string, tags: readonly string[]): string {
	return [
		ticket === null ? null : `\`${escape(ticket)}\``,
		status === 'open' && ticket === null ? null : storyStatusLabel[status as keyof typeof storyStatusLabel],
		tags.length === 0 ? null : tags.map((tag) => `\`+${escape(tag)}\``).join(' '),
	]
		.filter((part): part is string => part !== null && part !== undefined)
		.join(' · ');
}

/**
 * Escape the characters that would make free text into markup.
 *
 * Only the ones that bite *inline*, and only where a title realistically
 * contains them: a `*` or a `_` in the middle of a sentence turns the rest of
 * the line italic, a `` ` `` opens a code span that swallows the next one, a
 * `[` starts a link, and a `<` is raw HTML in every renderer that allows it. A
 * general-purpose escaper would also backslash every `#`, `-` and `.`, which
 * turns readable prose into something nobody wants to read in the raw.
 */
function escape(value: string): string {
	return value.replace(/([\\`*_[\]<>])/g, '\\$1');
}
