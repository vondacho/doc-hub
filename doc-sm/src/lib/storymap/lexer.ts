/**
 * The `.storymap` tokenizer.
 *
 * The language is brace-delimited and whitespace-insensitive, and that is the
 * most consequential decision in it. A file that arrives through a browser file
 * picker has been through an unknown editor — possibly a chat window, possibly a
 * copy-paste that re-tabbed every line. An indentation-sensitive grammar turns
 * all of that into a parse error; braces turn it into a formatting difference
 * nobody notices. LikeC4, which arch-hub already uses, made the same call.
 *
 * Every user-supplied name is a quoted string, so a title can never collide with
 * a keyword and the scanner needs no escaping rules beyond the string literal
 * itself. That is what keeps the grammar LL(1) with a single token of lookahead.
 *
 * This module never throws. Three failures are recoverable, and recovering means
 * the rest of the file still gets read and the author sees every problem at
 * once rather than one per trip through the file dialog.
 *
 * Keyword set is a parameter rather than a constant. doc-em and doc-es want this
 * scanner with six different words in it, and that is the only difference.
 */

import { isSaturated, report, type Problem } from './problems.ts';

export type TokenKind =
	| 'keyword'
	| 'string'
	| 'ident'
	| 'at'
	| 'hash'
	| 'lbrace'
	| 'rbrace'
	| 'eof';

export interface Token {
	readonly kind: TokenKind;
	/** For a string, the *decoded* text — escapes already resolved. */
	readonly value: string;
	/** 1-based. */
	readonly line: number;
	/** 1-based, in UTF-16 code units. */
	readonly column: number;
	/** 0-based index into the source. */
	readonly offset: number;
	/** Raw source length, so an error caret can be the right width. */
	readonly length: number;
}

/** The words that are keywords rather than identifiers in a `.storymap` file. */
export const STORYMAP_KEYWORDS: ReadonlySet<string> = new Set([
	'storymap',
	'release',
	'activity',
	'step',
	'story',
	'note',
]);

/**
 * Refuse anything larger before scanning a character of it.
 *
 * The file picker accepts whatever the visitor points it at, and a video file
 * would otherwise be scanned byte by byte into fifty thousand problems.
 */
export const MAX_SOURCE_BYTES = 2 * 1024 * 1024;

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_-]/;

/**
 * Scan `source` into tokens, appending anything wrong to `problems`.
 *
 * Returns a token array that always ends with `eof`, even for input it could
 * make no sense of at all — the parser is entitled to assume that.
 */
export function tokenize(
	source: string,
	problems: Problem[],
	keywords: ReadonlySet<string> = STORYMAP_KEYWORDS,
): readonly Token[] {
	const tokens: Token[] = [];

	// A leading byte-order mark otherwise makes the first token "unexpected
	// character" on a file that looks perfect in every editor. Strip it before
	// anything else touches the text, and before the offsets everyone reports
	// are computed from.
	const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;

	if (text.includes('\u0000')) {
		report(problems, {
			message: 'This does not look like a text file.',
			line: 1,
			column: 1,
			length: 0,
			hint: 'A story map is plain text. Pick a `.storymap` file exported from this board.',
		});
		return [eof(text.length, 1, 1)];
	}

	if (text.length > MAX_SOURCE_BYTES) {
		report(problems, {
			message: `The file is larger than ${Math.floor(MAX_SOURCE_BYTES / 1024 / 1024)} MiB.`,
			line: 1,
			column: 1,
			length: 0,
			hint: 'A story map with a thousand cards is a few tens of kilobytes.',
		});
		return [eof(text.length, 1, 1)];
	}

	let index = 0;
	let line = 1;
	let lineStart = 0;
	const column = () => index - lineStart + 1;

	/**
	 * Advance one newline. `\r\n` counts once — without this every line number
	 * after the first is right and every *column* is wrong on a file that came
	 * off Windows, which is the kind of bug that survives a whole afternoon.
	 */
	const newline = () => {
		if (text[index] === '\r' && text[index + 1] === '\n') index += 1;
		index += 1;
		line += 1;
		lineStart = index;
	};

	while (index < text.length && !isSaturated(problems)) {
		const char = text[index]!;

		if (char === '\n' || char === '\r') {
			newline();
			continue;
		}
		if (char === ' ' || char === '\t' || char === '\f' || char === '\v') {
			index += 1;
			continue;
		}

		// Comments are trivia and are discarded here. They never reach the
		// parser, which is also why they cannot survive a round trip — see the
		// preservation table in serialize.ts.
		if (char === '/' && text[index + 1] === '/') {
			while (index < text.length && text[index] !== '\n' && text[index] !== '\r') index += 1;
			continue;
		}

		const startOffset = index;
		const startColumn = column();

		if (char === '{' || char === '}') {
			index += 1;
			tokens.push({
				kind: char === '{' ? 'lbrace' : 'rbrace',
				value: char,
				line,
				column: startColumn,
				offset: startOffset,
				length: 1,
			});
			continue;
		}

		if (char === '@' || char === '#') {
			index += 1;
			tokens.push({
				kind: char === '@' ? 'at' : 'hash',
				value: char,
				line,
				column: startColumn,
				offset: startOffset,
				length: 1,
			});
			continue;
		}

		if (char === '"') {
			tokens.push(readString());
			continue;
		}

		if (IDENT_START.test(char)) {
			index += 1;
			while (index < text.length && IDENT_PART.test(text[index]!)) index += 1;
			const value = text.slice(startOffset, index);
			tokens.push({
				kind: keywords.has(value) ? 'keyword' : 'ident',
				value,
				line,
				column: startColumn,
				offset: startOffset,
				length: index - startOffset,
			});
			continue;
		}

		// Unknown character: record it and step over exactly one code point, so
		// the scan makes progress and the rest of the file is still read.
		report(problems, {
			message: `Unexpected character \`${char}\`.`,
			line,
			column: startColumn,
			length: 1,
		});
		index += 1;
	}

	tokens.push(eof(index, line, column()));
	return tokens;

	function readString(): Token {
		const startOffset = index;
		const startColumn = column();
		const startLine = line;
		index += 1; // opening quote

		let value = '';
		while (index < text.length) {
			const char = text[index]!;

			if (char === '"') {
				index += 1;
				return {
					kind: 'string',
					value,
					line: startLine,
					column: startColumn,
					offset: startOffset,
					length: index - startOffset,
				};
			}

			// A string never spans a line. Treating a newline as "unterminated"
			// here is what stops one missing quote from swallowing the rest of
			// the file into a single token.
			if (char === '\n' || char === '\r') break;

			if (char === '\\') {
				const escape = text[index + 1];
				if (escape === '"' || escape === '\\') {
					value += escape;
					index += 2;
					continue;
				}
				if (escape === 'n') {
					value += '\n';
					index += 2;
					continue;
				}
				if (escape === 't') {
					value += '\t';
					index += 2;
					continue;
				}
				report(problems, {
					message: `Unknown escape \`\\${escape ?? ''}\`.`,
					line,
					column: column(),
					length: escape === undefined ? 1 : 2,
					hint: 'The escapes are \\" \\\\ \\n and \\t.',
				});
				value += '\\';
				index += 1;
				continue;
			}

			value += char;
			index += 1;
		}

		// Unterminated. Report at the *opening* quote — that is where the author
		// has to go, and it is not where the scan stopped.
		report(problems, {
			message: 'Unterminated title — no closing `"` before the end of the line.',
			line: startLine,
			column: startColumn,
			length: 1,
			hint: 'Titles are quoted: activity "Discover documentation"',
		});
		return {
			kind: 'string',
			value,
			line: startLine,
			column: startColumn,
			offset: startOffset,
			length: index - startOffset,
		};
	}
}

function eof(offset: number, line: number, column: number): Token {
	return { kind: 'eof', value: '', line, column, offset, length: 0 };
}
