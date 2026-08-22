/**
 * The `.examplemap` parser — recursive descent over the token array.
 *
 * The same shape as doc-sm's, and a good deal shorter, because the technique is
 * smaller: four card kinds, one story, and examples that belong to a rule. There
 * is no release axis, no ticket, no persona — those belong to the map that picks
 * which story to open, not to the session that opens it.
 *
 * Errors are collected rather than fatal, for the reason doc-sm gives: these
 * files are hand-edited in an editor with no language server and imported
 * through a file picker, so failing on the first problem costs one trip through
 * a file dialog per typo.
 */

import { tokenize, type Token, type TokenKind } from './lexer.ts';
import {
	UNDEFINED_STORY,
	wrapNote,
	type ExampleMapDocument,
	type ExampleNode,
	type QuestionNode,
	type RuleNode,
	type StoryNode,
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
		examples.push({ title, notes });
		parseBody('example', () => parseNote(notes));
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

		const notes: string[] = [];
		const questions: QuestionNode[] = [];
		const node: StoryNode = { title, notes, questions };
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
		const notes: string[] = [];
		const rules: RuleNode[] = [];
		const story: { value: StoryNode | null; token: Token | null } = { value: null, token: null };

		if (at('keyword', 'examplemap')) {
			advance();
			const parsed = expectString('examplemap', 'The map is titled: examplemap "Redeem a voucher"');
			if (parsed !== undefined) title = parsed;
			parseBody(
				'examplemap',
				() => parseStory(story) || parseRule(rules) || parseNote(notes),
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
			notes: [...notes],
			// A map with no `story` line is not an error: it is a session that has
			// not named its story yet, which is exactly what a fresh board is.
			story: story.value ?? { title: UNDEFINED_STORY, notes: [], questions: [] },
			rules,
		};
	}

	return { parseFile };
}

function blank(title: string): ExampleMapDocument {
	return { title, notes: [], story: { title: UNDEFINED_STORY, notes: [], questions: [] }, rules: [] };
}
