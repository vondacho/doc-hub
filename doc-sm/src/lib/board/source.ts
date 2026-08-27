/**
 * Text surgery: the primitives every gesture on this board is built from.
 *
 * The `.storymap` file is the artefact. It lands in a pull request, it is read
 * in a terminal, and somebody has written comments in it — so a drag that
 * re-rendered the whole document would show up as a diff touching every line,
 * and would take their comments with it. Instead a drag replaces *one span* and
 * everything outside it comes back byte-identical.
 *
 * That is ba-ddd-mapper's rule, and this module is its `src/lib/source.ts`
 * ported to this grammar. The two formats share a shape — braces, quoted
 * strings that may span lines, bare words, `//` comments — so the five answers
 * below are the same in both: where a block ends, how to grow a span to the
 * lines it sits on, what indentation a new line should take.
 *
 * Every function is total and pure. None of them parse and none of them
 * validate; the caller re-parses and the problems panel says what happened.
 *
 * One rule they all keep: **what is written back is indented with spaces.**
 */

import type { Span } from '../storymap/model.ts';

/** Replace one span. The single primitive; everything else is built on it. */
export function splice(source: string, span: Span, replacement: string): string {
	return source.slice(0, span.start) + replacement + source.slice(span.end);
}

/**
 * Replace several spans in one pass.
 *
 * Applied right to left so an earlier edit does not shift the offsets of a
 * later one. Rewriting a card's notes moves several lines at once, and doing
 * them one at a time against stale spans would corrupt the file.
 */
export function spliceAll(
	source: string,
	edits: readonly { span: Span; replacement: string }[],
): string {
	return [...edits]
		.sort((a, b) => b.span.start - a.span.start)
		.reduce((text, edit) => splice(text, edit.span, edit.replacement), source);
}

/** A string as the format writes it. */
export function quote(text: string): string {
	return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Where the block opened at `open` closes, counting nested braces.
 *
 * Strings and comments are skipped rather than counted. A brace inside a note —
 * `note "the {order} is placed"` — is text, and a counter that took it for
 * structure would put the end of the block in the wrong place. Harmless when
 * the answer only bounds a search; it deletes the wrong half of somebody's file
 * when it is used to remove a lane.
 */
export function blockEnd(source: string, open: number): number {
	let depth = 0;
	let index = open;

	while (index < source.length) {
		const ch = source[index]!;

		if (ch === '"') {
			index += 1;
			while (index < source.length && source[index] !== '"') {
				index += source[index] === '\\' ? 2 : 1;
			}
			index += 1;
			continue;
		}

		if (ch === '/' && source[index + 1] === '/') {
			const newline = source.indexOf('\n', index);
			if (newline < 0) return source.length;
			index = newline + 1;
			continue;
		}

		if (ch === '{') depth += 1;
		else if (ch === '}') {
			depth -= 1;
			if (depth === 0) return index + 1;
		}
		index += 1;
	}
	return source.length;
}

/**
 * A span grown to the whole lines it sits on, with one blank line above it.
 *
 * Removing a declaration and leaving its indentation, its newline, or the gap
 * that separated it from its neighbour makes an add-then-remove fail to return
 * the file to where it started — every gesture slightly lossy, and the loss
 * accumulating in the diff.
 */
export function lineRegion(source: string, span: Span): Span {
	let end = span.end;
	while (end < source.length && (source[end] === ' ' || source[end] === '\t')) end += 1;
	if (source[end] === '\n') end += 1;

	let start = span.start;
	while (start > 0 && (source[start - 1] === ' ' || source[start - 1] === '\t')) start -= 1;
	if (source[start - 1] === '\n' && source[start - 2] === '\n') start -= 1;

	return { ...span, start, end };
}

/**
 * The indentation used by the lines inside the block opened at `open`.
 *
 * The first line **with something on it**. Reading the line straight after the
 * `{` is right for a dense file and wrong for a block that opens on a blank
 * line — and a block that opens on a blank line is what a freshly made step
 * looks like, so the very first card added to one would land in column zero.
 *
 * An empty block's first non-blank line is its own `}`, whose indentation is
 * the parent's; one step in from there is where a child belongs.
 */
export function indentInside(source: string, open: number): string {
	if (open < 0) return INDENT;

	let at = source.indexOf('\n', open);
	while (at >= 0) {
		const next = source.indexOf('\n', at + 1);
		const line = source.slice(at + 1, next < 0 ? source.length : next);
		if (line.trim() !== '') {
			const indent = spaces(/^[ \t]*/.exec(line)?.[0] ?? '');
			return line.trimStart().startsWith('}') ? indent + INDENT : indent;
		}
		if (next < 0) break;
		at = next;
	}

	return lineIndent(source, open) + INDENT;
}

/**
 * One level of indentation. **Two spaces, always.**
 *
 * Not a per-file preference: it is what the editor's Tab key types, what every
 * sample is written in, and the reason a `.storymap` looks the same in a
 * diff, in a review comment and in a terminal with opinions about tab stops. A
 * file that arrives with tabs is expanded rather than answered in kind.
 */
export const INDENT = '  ';

/**
 * Leading whitespace as the format writes it: spaces, one `INDENT` per tab.
 *
 * Everything this module *emits* goes through here, so a tab never reaches the
 * text by way of an edit. Reading is untouched — text outside the spliced span
 * comes back byte-identical, tabs and all. The rule is about what gets written,
 * not about rewriting somebody's file underneath them.
 */
export function spaces(indent: string): string {
	return indent.replace(/\t/g, INDENT);
}

/**
 * Shift every line of a block from one indentation to another.
 *
 * The first line is exempt when it carries none: a declaration span starts at
 * its keyword, past the indentation, so line one is already bare. Called with
 * `from` empty it therefore indents a whole fragment while keeping the relative
 * shape its inner lines were written with.
 */
export function reindent(block: string, from: string, to: string): string {
	return block
		.split('\n')
		.map((line) => {
			// A blank line stays blank. Prefixing it would leave trailing
			// whitespace on a line with nothing on it, which every linter and half
			// the reviewers in the world will flag.
			if (line.trim() === '') return line;
			return line.startsWith(from) ? to + line.slice(from.length) : line;
		})
		.join('\n');
}

/** The leading whitespace of the line `at` sits on, in spaces. */
export function lineIndent(source: string, at: number): string {
	const start = source.lastIndexOf('\n', Math.max(0, at - 1)) + 1;
	return spaces(/^[ \t]*/.exec(source.slice(start))?.[0] ?? '');
}
