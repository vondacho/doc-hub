/**
 * What went wrong, and where.
 *
 * Deliberately free of domain vocabulary: this file knows about positions and
 * messages, not about lanes or notes. It is one of the four modules copied
 * verbatim from doc-sm (with lexer.ts, history.ts and files.ts), so nothing
 * domain-specific may land here — that is what made the copy a copy.
 *
 * The error class follows the RegistryError precedent in doc-portal's
 * src/lib/products.ts — a named subclass, `name` set explicitly, `cause`
 * forwarded — and extends it in the one way this case needs: the structured
 * `problems` array. The island renders a list of them, and having to re-parse a
 * formatted `.message` to do that would be absurd.
 */

export interface Problem {
	/** Expected-vs-found, both named in backticks. */
	readonly message: string;
	/** 1-based. */
	readonly line: number;
	/** 1-based, in UTF-16 code units. */
	readonly column: number;
	/**
	 * Width of the offending token in the source, so a caret can be the right
	 * length. Carried rather than recomputed: reconstructing it later means
	 * re-lexing.
	 */
	readonly length: number;
	/** What the correct form looks like. Shown under the message, never instead of it. */
	readonly hint?: string;
}

/**
 * The ceiling on collected problems.
 *
 * Without one, a JPEG dropped into the file picker produces tens of thousands of
 * "unexpected character" entries and the browser stops responding while they
 * render. Fifty is far more than anyone fixes in one pass.
 */
export const MAX_PROBLEMS = 50;

/** True once the cap is reached; callers stop scanning rather than appending. */
export function isSaturated(problems: readonly Problem[]): boolean {
	return problems.length >= MAX_PROBLEMS;
}

/**
 * Append unless the cap is reached, in which case append one final note and
 * refuse everything after it.
 */
export function report(problems: Problem[], problem: Problem): void {
	if (problems.length < MAX_PROBLEMS) {
		problems.push(problem);
		return;
	}
	if (problems.length === MAX_PROBLEMS) {
		problems.push({
			message: `Stopped after ${MAX_PROBLEMS} problems. Fix these first.`,
			line: problem.line,
			column: problem.column,
			length: 0,
		});
	}
}

export function formatProblems(problems: readonly Problem[]): string {
	if (problems.length === 0) return 'The file could not be read.';
	const lines = problems.map((p) => `${p.line}:${p.column} ${p.message}`);
	const head = problems.length === 1 ? 'The event storm file has a problem:' : `The event storm file has ${problems.length} problems:`;
	return [head, ...lines].join('\n');
}

/**
 * Thrown by parse(), and by nothing else.
 *
 * One entry point that throws, rather than a second non-throwing `tryParse`:
 * two entry points is two places for the recovery policy to drift, and the
 * island's catch block is three lines.
 */
export class EventStormParseError extends Error {
	readonly problems: readonly Problem[];

	constructor(problems: readonly Problem[], options?: { cause?: unknown }) {
		super(formatProblems(problems), options);
		this.name = 'EventStormParseError';
		this.problems = problems;
	}
}
