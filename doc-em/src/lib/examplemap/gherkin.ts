/**
 * The map, as the feature file it becomes.
 *
 * dev-hub's page on the practice puts it plainly: the map leaves the room as a
 * Gherkin feature file, and the translation is almost mechanical — three of the
 * four card colours have a keyword of their own.
 *
 *   Story    (yellow) -> Feature:   one per file
 *   Rule     (blue)   -> Rule:      a real keyword since Gherkin 6
 *   Example  (green)  -> Example:   same word, same meaning as the card
 *   Question (red)    -> nothing
 *
 * ## Why this is a one-way door
 *
 * The fourth colour has no Gherkin, and that is not an oversight in Gherkin: an
 * open question is not a specification, so it cannot be written as one. Anything
 * that wrote the red cards into the file — as comments, or as tags — would be
 * inventing a convention no Cucumber will read and quietly claiming the map is
 * recoverable from it.
 *
 * So this writes and never reads. The `.examplemap` file is what round-trips;
 * this is the artefact, and the board says as much before it hands it over.
 *
 * ## The steps
 *
 * An example's card is one line — "a voucher that expired yesterday is refused".
 * Its Given/When/Then are written on the card too, when somebody has made the
 * line precise, and those are the steps written here verbatim. Nothing is
 * guessed: an example with no steps produces a scenario with no steps, and says
 * so, rather than a skeleton that puts words in somebody's mouth.
 *
 * `And` is generated, not stored. A second step of the same clause is written
 * `And` because that is how Gherkin renders a repeat — the map holds three
 * buckets and this decides how to print them, so the same rule applies here and
 * on the card.
 */

import { clauseKeyword, STEP_CLAUSES, type ExampleMapDocument, type ExampleNode } from './model.ts';

/** How many questions the file cannot carry. The caller warns with this. */
export function unwritableQuestions(document: ExampleMapDocument): number {
	return document.story.questions.length + document.rules.reduce((n, r) => n + r.questions.length, 0);
}

export function toGherkin(document: ExampleMapDocument): string {
	const out: string[] = [`Feature: ${document.story.title}`];

	for (const note of document.story.notes) {
		for (const line of note.split('\n')) out.push(`  ${line}`);
	}

	for (const rule of document.rules) {
		out.push('');
		out.push(`  Rule: ${rule.title}`);
		for (const note of rule.notes) {
			for (const line of note.split('\n')) out.push(`    ${line}`);
		}

		if (rule.examples.length === 0) {
			// Said rather than skipped: a rule with no examples is the practice's
			// own warning sign, and a feature file that silently omitted the rule
			// would hide it at exactly the moment it matters.
			out.push('');
			out.push('    # No examples yet — nobody has agreed what this rule means.');
			continue;
		}

		for (const example of rule.examples) {
			out.push('');
			out.push(`    Example: ${example.title}`);
			for (const note of example.notes) {
				for (const line of note.split('\n')) out.push(`      ${line}`);
			}
			emitSteps(out, example);
		}
	}

	return `${out.join('\n')}\n`;
}

/**
 * One example's steps, or a note saying it has none.
 *
 * A scenario with no steps is not an error in Gherkin — it parses, runs, and
 * passes. That is exactly why it is called out: a green suite that asserted
 * nothing is worse than a red one, and the person who opens this file should not
 * have to notice the absence for themselves.
 */
function emitSteps(out: string[], example: ExampleNode): void {
	const written = STEP_CLAUSES.flatMap((clause) =>
		example[clause]
			.filter((step) => step.trim() !== '')
			.map((step, index) => `${index === 0 ? clauseKeyword[clause] : 'And'} ${step.trim()}`),
	);

	if (written.length === 0) {
		out.push('      # No steps yet — this scenario would pass without asserting anything.');
		return;
	}
	for (const line of written) out.push(`      ${line}`);
}

/** `redeem-a-voucher.feature`, from the story rather than the map's title. */
export function featureFilename(document: ExampleMapDocument): string {
	const slug = document.story.title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60)
		.replace(/-+$/, '');
	return `${slug === '' ? 'untitled' : slug}.feature`;
}
