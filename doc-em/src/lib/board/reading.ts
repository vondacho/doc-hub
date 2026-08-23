/**
 * What the shape of the map is telling you.
 *
 * From dev-hub's page on the practice, which lists this as a thing you do
 * *before* anyone discusses the map:
 *
 *   many red cards          — the story is not ready; do not estimate it
 *   many blue cards         — the story is too big; split it along the rules
 *   a rule with no green    — nobody actually understands that rule yet
 *   many green under one    — the rule is more complicated than it looks, and
 *                             is often two rules
 *   few cards, quick        — the story is ready
 *
 * Worth building rather than leaving in the documentation, because it is the
 * one part of the technique a tool can genuinely do for you: counting cards is
 * mechanical, and the whole value is in noticing the counts before the room
 * starts arguing about the story.
 *
 * These are readings, not rules. Each one names what it saw so a person can
 * disagree with it — a tool that said "not ready" without saying why would just
 * be another opinion in the room.
 */

import { bands, examplesIn, examplesOfRule, UNSCHEDULED, type BoardState } from './state.ts';

export type ReadingTone = 'good' | 'watch' | 'stop';

export interface Reading {
	readonly tone: ReadingTone;
	readonly title: string;
	readonly detail: string;
}

/** Thresholds, named so they can be argued with rather than found by grepping. */
const MANY_QUESTIONS = 3;
const MANY_RULES = 6;
const MANY_EXAMPLES_ON_ONE_RULE = 5;
const FEW_CARDS = 10;

export function readMap(board: BoardState): readonly Reading[] {
	const rules = board.ruleOrder.map((id) => board.rules[id]).filter((r) => r !== undefined);
	// How many examples each rule has, read across every band. A rule's examples
	// are spread down the timeline now, and every count below means the same
	// thing it did when they were one list — see examplesOfRule in state.ts.
	const countOf = new Map(rules.map((rule) => [rule.id, examplesOfRule(board, rule.id).length]));
	const examplesOn = (rule: { id: string }): number => countOf.get(rule.id) ?? 0;

	const questions =
		(board.story?.questions.length ?? 0) + rules.reduce((n, rule) => n + rule.questionIds.length, 0);
	const examples = rules.reduce((n, rule) => n + examplesOn(rule), 0);
	const cards = 1 + rules.length + examples + questions;

	const readings: Reading[] = [];

	if (questions >= MANY_QUESTIONS) {
		readings.push({
			tone: 'stop',
			title: 'Not ready to estimate',
			detail: `${questions} open questions. Every one is an assumption somebody would otherwise make silently.`,
		});
	}

	if (rules.length >= MANY_RULES) {
		readings.push({
			tone: 'watch',
			title: 'The story is probably too big',
			detail: `${rules.length} rules. A story this wide usually splits cleanly along them.`,
		});
	}

	const bare = rules.filter((rule) => examplesOn(rule) === 0);
	if (bare.length > 0) {
		readings.push({
			tone: 'watch',
			title: bare.length === 1 ? 'A rule with no examples' : `${bare.length} rules with no examples`,
			detail: `Nobody has agreed what ${bare.map((rule) => `"${rule.title}"`).join(', ')} means yet.`,
		});
	}

	const crowded = rules.filter((rule) => examplesOn(rule) >= MANY_EXAMPLES_ON_ONE_RULE);
	for (const rule of crowded) {
		readings.push({
			tone: 'watch',
			title: 'One rule is carrying a lot',
			detail: `"${rule.title}" has ${examplesOn(rule)} examples. A rule that needs this many is often two rules.`,
		});
	}

	readings.push(...scheduleReadings(board));

	if (readings.length === 0 && cards <= FEW_CARDS && rules.length > 0 && examples > 0) {
		readings.push({
			tone: 'good',
			title: 'This story looks ready',
			detail: `${rules.length} rules, ${examples} examples, nothing open. This is the outcome the session is for.`,
		});
	}

	return readings;
}

/**
 * What the *timeline* is telling you, as opposed to the cards.
 *
 * Warnings and not parse errors, which is the decision the whole time axis rests
 * on. A file that says something contradictory about when things ship still
 * opens: you very often move the release first and the examples after, and a
 * parser that refused the intermediate state would make replanning impossible in
 * the tool that exists to plan. So the board accepts it and says what it noticed.
 *
 * Derived on every render rather than stored. There is no cached warning to go
 * stale and no reducer branch that has to remember to recompute one.
 *
 * ## Why "after" and not "at or after"
 *
 * An example delivered *in* the same band as its story is ordinary — the last
 * examples land with the release itself, and a board where the release row had
 * to be empty would describe a process nobody runs. What is contradictory is an
 * example scheduled *later* than the release the story ships in: the story would
 * be done before the thing that makes it true.
 */
function scheduleReadings(board: BoardState): readonly Reading[] {
	// No story means nothing is scheduled, so there is nothing to contradict.
	const release = board.story?.release ?? null;
	if (release === null) return [];

	const readings: Reading[] = [];
	const shipsIn = board.deliveries[release];
	if (shipsIn === undefined) return [];

	if (shipsIn.kind === 'sprint') {
		readings.push({
			tone: 'watch',
			title: 'The story ships in a sprint',
			detail: `"${shipsIn.title}" is a sprint. A story is usually delivered in a release, with sprints as the steps towards it.`,
		});
	}

	// Everything strictly below the story's band on the timeline. Below-the-line
	// is not among them: unscheduled is not late, it is undecided.
	const order = board.deliveryOrder;
	const after = new Set(order.slice(order.indexOf(release) + 1));
	if (after.size === 0) return readings;

	const late: string[] = [];
	for (const ruleId of board.ruleOrder) {
		for (const band of bands(board)) {
			if (band === UNSCHEDULED || !after.has(band)) continue;
			for (const id of examplesIn(board, ruleId, band)) {
				const example = board.examples[id];
				if (example) late.push(example.title);
			}
		}
	}

	if (late.length > 0) {
		readings.push({
			tone: 'stop',
			title: late.length === 1 ? 'An example ships after the story does' : `${late.length} examples ship after the story does`,
			detail: `${late.map((title) => `"${title}"`).join(', ')} land after "${shipsIn.title}", so the story would be done before what makes it true.`,
		});
	}

	return readings;
}
