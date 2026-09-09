/**
 * The map as prose: one Markdown document.
 *
 * The picture is for a deck; this is for a wiki page, a pull request, or the
 * body of a ticket — the places where a `.svg` is an attachment nobody opens
 * and an image is not searchable. It is also the only export a screen reader, a
 * `grep` or a diff can do anything with, which is why it exists alongside the
 * two pictures rather than instead of one of them.
 *
 * ## It follows the backbone
 *
 * Activity, then step, then the stories under it in band order. That is the
 * document's own order and the source pane's, and it is the only one that keeps
 * the narrative: the backbone reads left to right in the order a user meets it,
 * and a document that led with the deliveries would be a release plan that had
 * lost the story it is a plan for.
 *
 * The band is written on every story instead, so the slice is still recoverable
 * — and `## The slice` below states it outright, which is the one thing prose
 * can do better than the picture.
 *
 * ## The slice is computed, not left to be noticed
 *
 * The doctrine says to ask which activities a delivery leaves empty: a slice
 * that ships three whole activities and none of the fourth is a plan to ship a
 * product that stops working halfway through the job. On the board that is a
 * visible hole in a row. In prose it is nothing at all unless somebody counts,
 * so this counts.
 *
 * It is stated as a finding, not a verdict. An activity a delivery leaves empty
 * is often correct — the first slice of a map does not have to touch
 * everything — and a document that said "this release is wrong" would be
 * another opinion in the room rather than the map's own account of itself.
 *
 * ## Nothing is dated
 *
 * There is no "exported on" line, and it is not an oversight. An outline is the
 * export most likely to be committed beside the code it describes, and a
 * timestamp would make every regeneration a diff — the same map, a different
 * file, for no reason a reviewer can act on. The `.storymap` file carries no
 * date either, for the same reason.
 */

import { storyStatusLabel } from '../storymap/model.ts';
import {
	bandOrder,
	stepOrder,
	storiesIn,
	UNASSIGNED,
	type BandId,
	type BoardState,
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

	out.push(...deliveries(board), ...backbone(board, shown), ...slice(board, shown));

	return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

/** The timeline, in order, with the below-the-line row named at the end. */
function deliveries(board: BoardState): readonly string[] {
	if (board.deliveryOrder.length === 0) return [];
	const out = ['## The timeline', ''];
	for (const id of board.deliveryOrder) {
		const delivery = board.deliveries[id];
		if (!delivery) continue;
		const meta = [delivery.kind, delivery.ticket].filter((part): part is string => Boolean(part));
		out.push(`- **${escape(delivery.title)}** — ${meta.join(' · ')}`);
		for (const note of delivery.notes) for (const line of note.split('\n')) out.push(`  ${escape(line)}`);
	}
	out.push('', '');
	return out;
}

function backbone(board: BoardState, shown: (id: Id) => boolean): readonly string[] {
	const out: string[] = [];

	for (const activityId of board.activityOrder) {
		const activity = board.activities[activityId];
		if (!activity) continue;

		out.push(`## ${escape(activity.title)}`, '');
		const meta = cardMeta(activity.ticket, activity.status, activity.tags);
		if (meta !== '') out.push(meta, '');
		if (activity.personas.length > 0) {
			out.push(`*For ${activity.personas.map(escape).join(', ')}.*`, '');
		}
		for (const note of activity.notes) out.push(escape(note), '');

		if (activity.stepOrder.length === 0) {
			// An activity with no steps keeps its place — it is an ordinary state
			// mid-workshop — and an empty heading followed by the next heading
			// reads as a document that lost something.
			out.push('*No steps yet.*', '');
			continue;
		}

		for (const stepId of activity.stepOrder) {
			const step = board.steps[stepId];
			if (!step) continue;

			out.push(`### ${escape(step.title)}`, '');
			const stepMeta = cardMeta(step.ticket, step.status, step.tags);
			if (stepMeta !== '') out.push(stepMeta, '');
			for (const note of step.notes) out.push(escape(note), '');

			let wrote = false;
			for (const band of bandOrder(board)) {
				for (const id of storiesIn(board, stepId, band).filter(shown)) {
					const story = board.stories[id];
					if (!story) continue;
					wrote = true;

					out.push(`- **${escape(bandName(board, band))}** — ${escape(story.title)}`);
					const line = cardMeta(story.ticket, story.status, story.tags);
					if (line !== '') out.push(`  ${line}`);
					/*
					 * The three clauses on one line, in order, and only the ones
					 * that exist. `so` is what decides whether a story is worth
					 * building, so it is never summarised away — and a half-written
					 * story shows as half-written rather than as a sentence with a
					 * hole punched in it.
					 */
					const need = [
						story.persona === null ? null : `As ${escape(story.persona)}`,
						story.want === null ? null : `I want ${escape(story.want)}`,
						story.soThat === null ? null : `so that ${escape(story.soThat)}`,
					].filter((part): part is string => part !== null);
					if (need.length > 0) out.push(`  ${need.join(', ')}.`);
					// Two spaces of indent on every line, including the ones inside
					// one note: a note written at column zero ends the list, and
					// every item under it reflows into one run-on paragraph.
					for (const note of story.notes) {
						for (const noteLine of note.split('\n')) out.push(`  ${escape(noteLine)}`);
					}
				}
			}
			if (!wrote) out.push('*No stories on this step.*');
			out.push('');
		}
	}

	return out;
}

/**
 * Which activities each delivery leaves untouched.
 *
 * The question the doctrine tells a reader to ask, answered rather than
 * prompted. Below-the-line is left out of it: that band is by definition what
 * the plan does not carry, so listing what it "leaves empty" would be listing
 * everything the plan *does* cover, which is the same fact upside down and
 * reads as an alarm.
 */
function slice(board: BoardState, shown: (id: Id) => boolean): readonly string[] {
	if (board.deliveryOrder.length === 0 || board.activityOrder.length === 0) return [];

	const out = [
		'## The slice',
		'',
		'What each delivery leaves untouched. An empty activity is a finding, not a fault — a first slice does not have to reach everything — but it is the question worth asking before the plan is agreed.',
		'',
	];

	for (const deliveryId of board.deliveryOrder) {
		const delivery = board.deliveries[deliveryId];
		if (!delivery) continue;

		const empty = board.activityOrder.filter((activityId) => {
			const activity = board.activities[activityId];
			if (!activity) return false;
			return !activity.stepOrder.some((stepId) => storiesIn(board, stepId, deliveryId).some(shown));
		});

		const names = empty
			.map((id) => board.activities[id]?.title)
			.filter((title): title is string => title !== undefined);

		out.push(
			names.length === 0
				? `- **${escape(delivery.title)}** — touches every activity.`
				: `- **${escape(delivery.title)}** — nothing in ${names.map((n) => escape(n)).join(', ')}.`,
		);
	}

	const unscheduled = countIn(board, UNASSIGNED, shown);
	if (unscheduled > 0) {
		out.push(
			'',
			`${unscheduled} ${unscheduled === 1 ? 'story is' : 'stories are'} below the line. That is the map saying what the plan currently leaves out, and it is worth reading before anybody adds another delivery.`,
		);
	}

	return out;
}

function countIn(board: BoardState, band: BandId, shown: (id: Id) => boolean): number {
	return stepOrder(board).reduce((total, stepId) => total + storiesIn(board, stepId, band).filter(shown).length, 0);
}

function bandName(board: BoardState, band: BandId): string {
	return band === UNASSIGNED ? 'Not scheduled' : (board.deliveries[band]?.title ?? 'Not scheduled');
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
	const parts = [
		ticket === null ? null : `\`${escape(ticket)}\``,
		status === 'open' && ticket === null ? null : storyStatusLabel[status as keyof typeof storyStatusLabel],
		tags.length === 0 ? null : tags.map((tag) => `\`+${escape(tag)}\``).join(' '),
	].filter((part): part is string => part !== null && part !== undefined);
	return parts.join(' · ');
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
