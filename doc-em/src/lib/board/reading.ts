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

import type { BoardState } from './state.ts';

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
	const questions =
		board.story.questions.length + rules.reduce((n, rule) => n + rule.questionIds.length, 0);
	const examples = rules.reduce((n, rule) => n + rule.exampleIds.length, 0);
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

	const bare = rules.filter((rule) => rule.exampleIds.length === 0);
	if (bare.length > 0) {
		readings.push({
			tone: 'watch',
			title: bare.length === 1 ? 'A rule with no examples' : `${bare.length} rules with no examples`,
			detail: `Nobody has agreed what ${bare.map((rule) => `"${rule.title}"`).join(', ')} means yet.`,
		});
	}

	const crowded = rules.filter((rule) => rule.exampleIds.length >= MANY_EXAMPLES_ON_ONE_RULE);
	for (const rule of crowded) {
		readings.push({
			tone: 'watch',
			title: 'One rule is carrying a lot',
			detail: `"${rule.title}" has ${rule.exampleIds.length} examples. A rule that needs this many is often two rules.`,
		});
	}

	if (readings.length === 0 && cards <= FEW_CARDS && rules.length > 0 && examples > 0) {
		readings.push({
			tone: 'good',
			title: 'This story looks ready',
			detail: `${rules.length} rules, ${examples} examples, nothing open. This is the outcome the session is for.`,
		});
	}

	return readings;
}
