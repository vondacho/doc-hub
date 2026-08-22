/**
 * The `.examplemap` parser — recursive descent over the token array.
 *
 * The same shape as doc-sm's, and a good deal shorter, because the technique is
 * smaller: four card kinds, one story, and examples that belong to a rule. There
 * is no release axis and no persona — those belong to the map that picks which
 * story to open, not to the session that opens it.
 *
 * There is a ticket, though, and exactly one. The story under discussion is a
 * story in somebody's tracker, and `#id ~status` after its title is how the file
 * says which one. doc-sm spells the same two annotations the same way on all
 * three of its rows; here there is one row to put them on.
 *
 * Errors are collected rather than fatal, for the reason doc-sm gives: these
 * files are hand-edited in an editor with no language server and imported
 * through a file picker, so failing on the first problem costs one trip through
 * a file dialog per typo.
 */

import { tokenize, type Token, type TokenKind } from './lexer.ts';
import {
	DEFAULT_STORY_STATUS,
	emptyStory,
	isStoryStatus,
	STEP_CLAUSES,
	STORY_STATUSES,
	wrapNote,
	type ExampleMapDocument,
	type ExampleNode,
	type QuestionNode,
	type RuleNode,
	type StepClause,
	type StoryNode,
	type StoryStatus,
} from './model.ts';
import { ExampleMapParseError, isSaturated, report, type Problem } from './problems.ts';

/**
 * Read an example map.
 *
 * @throws {ExampleMapParseError} carrying every problem found, not just the first.
 */
export function parse(source: string): ExampleMapDocument {
	const problems: Problem[] = [];
	const tokens = tokenize(source, problems);
	const document = createParser(tokens, problems).parseFile();

	if (problems.length > 0) throw new ExampleMapParseError(problems);
	return document;
}

/** What each clause looks like written properly, for the error hint. */
const stepExample: Record<StepClause, string> = {
	given: 'a voucher that expired on 2026-08-21',
	when: 'the voucher is applied to the basket',
	then: 'the voucher is refused',
};

function createParser(tokens: readonly Token[], problems: Problem[]) {
	let position = 0;

	const peek = (ahead = 0): Token => tokens[Math.min(position + ahead, tokens.length - 1)]!;
	const at = (kind: TokenKind, value?: string): boolean => {
		const token = peek();
		return token.kind === kind && (value === undefined || token.value === value);
	};
	const advance = (): Token => tokens[Math.min(position++, tokens.length - 1)]!;
	const atDeclaration = (): boolean => at('keyword') && peek().value !== 'examplemap';

	const problemAt = (token: Token, message: string, hint?: string): void =>
		report(problems, { message, line: token.line, column: token.column, length: token.length, hint });

	const describe = (token: Token): string => {
		switch (token.kind) {
			case 'eof':
				return 'the end of the file';
			case 'string':
				return `the title "${token.value}"`;
			default:
				return `\`${token.value}\``;
		}
	};

	function expectString(after: string, hint: string): string | undefined {
		if (at('string')) return advance().value;
		problemAt(peek(), `Expected a quoted title after \`${after}\`, found ${describe(peek())}.`, hint);
		return undefined;
	}

	/** Panic-mode recovery: skip to a sibling declaration or the closing brace. */
	function synchronize(): void {
		let depth = 0;
		while (!at('eof')) {
			if (depth === 0 && (atDeclaration() || at('rbrace'))) return;
			if (at('lbrace')) depth += 1;
			else if (at('rbrace')) depth -= 1;
			advance();
		}
	}

	function parseBody(owner: string, item: () => boolean): void {
		if (!at('lbrace')) return;
		const open = advance();

		while (!at('rbrace') && !at('eof') && !isSaturated(problems)) {
			if (item()) continue;
			problemAt(peek(), `Unexpected ${describe(peek())} inside \`${owner}\`.`);
			synchronize();
		}

		if (at('rbrace')) {
			advance();
			return;
		}
		problemAt(
			peek(),
			`Expected \`}\` to close \`${owner}\`, found ${describe(peek())}.`,
			`The \`{\` on line ${open.line} is never closed.`,
		);
	}

	/** `note "…"` — one string, with `\n` or a trailing backslash for its breaks. */
	function parseNote(notes: string[]): boolean {
		if (!at('keyword', 'note')) return false;
		advance();
		const text = expectString('note', 'A note is quoted: note "Ask the payments team"');
		if (text === undefined) {
			synchronize();
			return true;
		}
		notes.push(wrapNote(text));
		return true;
	}

	function parseQuestion(questions: QuestionNode[]): boolean {
		if (!at('keyword', 'question')) return false;
		advance();
		const title = expectString(
			'question',
			'A question is quoted: question "Is the expiry checked at apply or at pay?"',
		);
		if (title === undefined) {
			synchronize();
			return true;
		}
		const notes: string[] = [];
		questions.push({ title, notes });
		parseBody('question', () => parseNote(notes));
		return true;
	}

	/**
	 * `given "…"`, `when "…"`, `then "…"` — each repeatable within one example.
	 *
	 * Repetition is the whole notation: a second `given` is what Gherkin prints
	 * as `And`. The file says which clause each line belongs to, so the lines can
	 * be written in any order and reordered later without changing meaning; the
	 * serializer puts them back in Gherkin's order on the way out.
	 */
	function parseStep(steps: Record<StepClause, string[]>): boolean {
		const clause = STEP_CLAUSES.find((candidate) => at('keyword', candidate));
		if (clause === undefined) return false;
		advance();
		const text = expectString(
			clause,
			`A step is quoted: ${clause} "${stepExample[clause]}"`,
		);
		if (text === undefined) {
			synchronize();
			return true;
		}
		// A step is one line of a scenario, so its own breaks are not meaningful;
		// collapse them rather than writing a Gherkin file that will not parse.
		steps[clause].push(text.replace(/\s*\n\s*/g, ' ').trim());
		return true;
	}

	function parseExample(examples: ExampleNode[]): boolean {
		if (!at('keyword', 'example')) return false;
		advance();
		const title = expectString(
			'example',
			'An example is quoted, with real values: example "A voucher that expired yesterday is refused"',
		);
		if (title === undefined) {
			synchronize();
			return true;
		}
		const notes: string[] = [];
		const steps: Record<StepClause, string[]> = { given: [], when: [], then: [] };
		examples.push({ title, notes, given: steps.given, when: steps.when, then: steps.then });
		parseBody('example', () => parseStep(steps) || parseNote(notes));
		return true;
	}

	function parseRule(rules: RuleNode[]): boolean {
		if (!at('keyword', 'rule')) return false;
		advance();
		const title = expectString('rule', 'A rule is quoted: rule "A voucher must not be expired"');
		if (title === undefined) {
			synchronize();
			return true;
		}

		const notes: string[] = [];
		const examples: ExampleNode[] = [];
		const questions: QuestionNode[] = [];
		rules.push({ title, notes, examples, questions });
		parseBody('rule', () => parseExample(examples) || parseQuestion(questions) || parseNote(notes));
		return true;
	}

	/**
	 * `product "client-onboarding"` — at most one per map.
	 *
	 * A second one is an error rather than a last-one-wins overwrite: a map is
	 * about one product, and two declarations mean a bad merge, which is exactly
	 * the thing worth surfacing rather than silently resolving.
	 */
	function parseOnce(
		word: 'product' | 'space',
		state: { value: string | null; token: Token | null },
		hint: string,
		twice: string,
	): boolean {
		if (!at('keyword', word)) return false;
		const keyword = advance();
		const value = expectString(word, hint);
		if (value === undefined) {
			synchronize();
			return true;
		}
		if (state.token !== null) {
			problemAt(keyword, twice, `Already declared on line ${state.token.line}.`);
			return true;
		}
		state.value = value;
		state.token = keyword;
		return true;
	}

	/**
	 * The `#ticket` and `~status` that may follow the story's title.
	 *
	 * Only the story takes them. A rule is not a ticket and neither is an
	 * example: they are the story broken down, and breaking a story down does not
	 * produce more tickets — that is the difference between example mapping and
	 * the story map next door, where every row is a level in the tracker.
	 *
	 * Either order is accepted, since there is no reading in which one is more
	 * correct, and each may appear once. A repeat is an error rather than a
	 * last-one-wins, because a repeat means a bad merge.
	 */
	function parseStoryAnnotations(): { ticket: string | null; status: StoryStatus } {
		let ticket: string | null = null;
		let status: StoryStatus | null = null;

		while (at('at') || at('hash') || at('tilde')) {
			const sigil = advance();

			// `@` is doc-sm's release sigil, and a hand-written map is quite likely
			// to arrive carrying one. Naming what it means there is more use than
			// "unexpected character" — the author knows the notation, just not that
			// this map has no bands.
			if (sigil.kind === 'at') {
				problemAt(
					sigil,
					'An example map has no releases.',
					'`@` puts a story in a band on a story map. An example map is one story, so there is nothing to band.',
				);
				if (at('ident') || at('string')) advance();
				continue;
			}

			if (sigil.kind === 'hash') {
				if (!at('ident') && !at('string')) {
					problemAt(
						sigil,
						`Expected a ticket id after \`#\`, found ${describe(peek())}.`,
						'Write the id the ticketing system issued: #CLONB-42',
					);
					continue;
				}
				const value = advance().value;
				if (ticket !== null) {
					problemAt(sigil, 'This story names two tickets.', 'A story links to one ticket.');
					continue;
				}
				ticket = value;
				continue;
			}

			if (!at('ident')) {
				problemAt(
					sigil,
					`Expected a status after \`~\`, found ${describe(peek())}.`,
					`One of: ${STORY_STATUSES.map((x) => `~${x}`).join(', ')}`,
				);
				continue;
			}
			const word = advance();
			if (status !== null) {
				problemAt(sigil, 'This story names two statuses.', 'A story is in one state.');
				continue;
			}
			if (!isStoryStatus(word.value)) {
				problemAt(
					word,
					`\`${word.value}\` is not a status.`,
					`One of: ${STORY_STATUSES.map((x) => `~${x}`).join(', ')}`,
				);
				continue;
			}
			status = word.value;
		}

		// Unlinked, and nothing said about it yet.
		return { ticket, status: status ?? DEFAULT_STORY_STATUS };
	}

	/**
	 * `story "…"` — exactly one.
	 *
	 * A second is an error rather than a list, because the practice is defined as
	 * taking one story: two stories on one map is two sessions, and merging them
	 * would hide that rather than surface it.
	 */
	function parseStory(state: { value: StoryNode | null; token: Token | null }): boolean {
		if (!at('keyword', 'story')) return false;
		const keyword = advance();
		const title = expectString('story', 'The story is quoted: story "Redeem a voucher"');
		if (title === undefined) {
			synchronize();
			return true;
		}

		const { ticket, status } = parseStoryAnnotations();
		const notes: string[] = [];
		const questions: QuestionNode[] = [];
		const node: StoryNode = { title, notes, ticket, status, questions };
		parseBody('story', () => parseQuestion(questions) || parseNote(notes));

		if (state.token !== null) {
			problemAt(
				keyword,
				'This map has two stories.',
				`Already given on line ${state.token.line}. Example mapping takes one story; a second is a second session.`,
			);
			return true;
		}
		state.value = node;
		state.token = keyword;
		return true;
	}

	function parseFile(): ExampleMapDocument {
		while (!at('eof') && !at('keyword', 'examplemap')) {
			problemAt(
				peek(),
				`Expected \`examplemap\`, found ${describe(peek())}.`,
				'A file holds one example map: examplemap "Redeem a voucher" { … }',
			);
			synchronize();
			if (!at('eof') && !at('keyword', 'examplemap') && !atDeclaration()) advance();
			else if (atDeclaration()) break;
		}

		if (at('eof')) {
			if (problems.length === 0) {
				report(problems, {
					message: 'The file is empty.',
					line: 1,
					column: 1,
					length: 0,
					hint: 'An example map starts with: examplemap "Its title" { … }',
				});
			}
			return blank('Untitled example map');
		}

		let title = 'Untitled example map';
		const product: { value: string | null; token: Token | null } = { value: null, token: null };
		const space: { value: string | null; token: Token | null } = { value: null, token: null };
		const notes: string[] = [];
		const rules: RuleNode[] = [];
		const story: { value: StoryNode | null; token: Token | null } = { value: null, token: null };

		if (at('keyword', 'examplemap')) {
			advance();
			const parsed = expectString('examplemap', 'The map is titled: examplemap "Redeem a voucher"');
			if (parsed !== undefined) title = parsed;
			parseBody(
				'examplemap',
				() =>
					parseOnce(
						'product',
						product,
						'A product is its shortname, quoted: product "client-onboarding"',
						'The product is declared twice. An example map is about one product.',
					) ||
					parseOnce(
						'space',
						space,
						'A ticketing space is quoted: space "CLONB"',
						'The ticketing space is declared twice. A ticket is raised into one space.',
					) ||
					parseStory(story) ||
					parseRule(rules) ||
					parseNote(notes),
			);
		}

		while (!at('eof')) {
			if (at('keyword', 'examplemap')) {
				problemAt(
					peek(),
					'A second `examplemap` block.',
					'One file holds one example map. Split them into two files.',
				);
			} else {
				problemAt(peek(), `Unexpected ${describe(peek())} after the example map.`);
			}
			synchronize();
			if (!at('eof') && !at('keyword', 'examplemap')) advance();
		}

		return {
			title,
			product: product.value,
			space: space.value,
			notes: [...notes],
			// A map with no `story` line is not an error: it is a session that has
			// not named its story yet, which is exactly what a fresh board is.
			story: story.value ?? emptyStory(),
			rules,
		};
	}

	return { parseFile };
}

function blank(title: string): ExampleMapDocument {
	return { title, product: null, space: null, notes: [], story: emptyStory(), rules: [] };
}
