/**
 * The `.examplemap` parser — recursive descent over the token array.
 *
 * The same shape as doc-sm's, and a good deal shorter, because the technique is
 * smaller: four card kinds, one story, and examples that belong to a rule. There
 * is no persona — that belongs to the map that picks which story to open, not to
 * the session that opens it.
 *
 * There *is* a release axis, which there was not when this parser was written.
 * `delivery` lines declare it in timeline order, and `@` places the story and
 * each example on it — the same sigil doc-sm uses for the same job. Like
 * doc-sm's, the reference is resolved in phase 2, so a delivery may be declared
 * after the example that ships in it.
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
	DELIVERY_KINDS,
	isDeliveryKind,
	isStoryStatus,
	STEP_CLAUSES,
	STORY_STATUSES,
	wrapNote,
	type DeliveryKind,
	type DeliveryNode,
	type ExampleMapDocument,
	type ExampleNode,
	type QuestionNode,
	type RuleNode,
	type StepClause,
	type StoryNode,
	type StoryStatus,
	NOWHERE,
	type AnnotationSpans,
	type Span,
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
	const document = createParser(tokens, problems, source).parseFile();

	if (problems.length > 0) throw new ExampleMapParseError(problems);
	return document;
}

/** What each clause looks like written properly, for the error hint. */
const stepExample: Record<StepClause, string> = {
	given: 'a voucher that expired on 2026-08-21',
	when: 'the voucher is applied to the basket',
	then: 'the voucher is refused',
};

function createParser(tokens: readonly Token[], problems: Problem[], source: string) {
	let position = 0;

	const peek = (ahead = 0): Token => tokens[Math.min(position + ahead, tokens.length - 1)]!;

	/*
	 * Spans, built from what the lexer already records.
	 *
	 * Every token carries `offset` and `length`, so none of this needed a change
	 * to the lexer. `line` and `column` come from the first token, which is where
	 * a problems entry points and where the editor scrolls to.
	 */
	const tokenSpan = (token: Token): Span => ({
		start: token.offset,
		end: token.offset + token.length,
		line: token.line,
		column: token.column,
	});
	const previous = (): Token => tokens[Math.max(0, Math.min(position - 1, tokens.length - 1))]!;
	const spanFrom = (from: Token, to: Token = previous()): Span => ({
		start: from.offset,
		end: Math.max(from.offset + from.length, to.offset + to.length),
		line: from.line,
		column: from.column,
	});

	type NoteRun = { first: Token | null; last: Token | null };
	const noteRun = (): NoteRun => ({ first: null, last: null });
	const runSpan = (run: NoteRun): Span | null =>
		run.first === null ? null : spanFrom(run.first, run.last ?? run.first);

	const NO_ANNOTATIONS: AnnotationSpans = { release: null, ticket: null, status: null };
	const at = (kind: TokenKind, value?: string): boolean => {
		const token = peek();
		return token.kind === kind && (value === undefined || token.value === value);
	};
	const advance = (): Token => tokens[Math.min(position++, tokens.length - 1)]!;
	const atDeclaration = (): boolean => at('keyword') && peek().value !== 'examplemap';

	/*
	 * Every `@delivery` written anywhere in the file, with where it was written.
	 *
	 * Phase 2 of doc-sm's design, done without doc-sm's second tree. There, a
	 * story's release has to be *rewritten* once the releases are known, so the
	 * parser builds raw nodes and `resolve` converts them. Here the stored value
	 * is the delivery's title — the same string the reference is written with —
	 * so there is nothing to rewrite and the node can be built on the spot.
	 *
	 * What still cannot be decided until the end is whether the reference names
	 * anything, because a `delivery` line may appear after the example that ships
	 * in it. So the check is deferred and only the *position* has to be carried,
	 * which is what this list is: enough to report at the right caret, and no
	 * more.
	 */
	const references: { name: string; token: Token; what: string }[] = [];
	const deliveries: { node: DeliveryNode; token: Token }[] = [];

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

	function expectString(after: string, hint: string): Token | undefined {
		if (at('string')) return advance();
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

	/** A `{ … }` body, and where its braces are. Null when written without one. */
	function parseBody(owner: string, item: () => boolean): { open: number; close: number } | null {
		if (!at('lbrace')) return null;
		const open = advance();

		while (!at('rbrace') && !at('eof') && !isSaturated(problems)) {
			if (item()) continue;
			problemAt(peek(), `Unexpected ${describe(peek())} inside \`${owner}\`.`);
			synchronize();
		}

		if (at('rbrace')) {
			const close = advance();
			return { open: open.offset, close: close.offset + close.length };
		}
		problemAt(
			peek(),
			`Expected \`}\` to close \`${owner}\`, found ${describe(peek())}.`,
			`The \`{\` on line ${open.line} is never closed.`,
		);
		return { open: open.offset, close: source.length };
	}

	/** `note "…"` — one string, with `\n` or a trailing backslash for its breaks. */
	function parseNote(notes: string[], run?: NoteRun): boolean {
		if (!at('keyword', 'note')) return false;
		const keyword = advance();
		const text = expectString('note', 'A note is quoted: note "Ask the payments team"');
		if (text === undefined) {
			synchronize();
			return true;
		}
		notes.push(wrapNote(text.value));
		if (run) {
			run.first ??= keyword;
			run.last = text;
		}
		return true;
	}

	function parseQuestion(questions: QuestionNode[]): boolean {
		if (!at('keyword', 'question')) return false;
		const keyword = advance();
		const title = expectString(
			'question',
			'A question is quoted: question "Is the expiry checked at apply or at pay?"',
		);
		if (title === undefined) {
			synchronize();
			return true;
		}
		const notes: string[] = [];
		const run = noteRun();
		const body = parseBody('question', () => parseNote(notes, run));
		questions.push({
			title: title.value,
			notes,
			spans: {
				span: spanFrom(keyword),
				titleSpan: tokenSpan(title),
				annotations: NO_ANNOTATIONS,
				openBrace: body?.open ?? -1,
				notesSpan: runSpan(run),
			},
		});
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
	function parseStep(
		steps: Record<StepClause, string[]>,
		spans?: Record<StepClause, Span[]>,
	): boolean {
		const clause = STEP_CLAUSES.find((candidate) => at('keyword', candidate));
		if (clause === undefined) return false;
		const keyword = advance();
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
		steps[clause].push(text.value.replace(/\s*\n\s*/g, ' ').trim());
		// One span per step line, so editing the second `then` rewrites that line
		// and leaves the first alone.
		spans?.[clause].push(spanFrom(keyword, text));
		return true;
	}

	function parseExample(examples: ExampleNode[]): boolean {
		if (!at('keyword', 'example')) return false;
		const keyword = advance();
		const title = expectString(
			'example',
			'An example is quoted, with real values: example "A voucher that expired yesterday is refused"',
		);
		if (title === undefined) {
			synchronize();
			return true;
		}
		// `@delivery` is the only annotation an example takes. It carries no ticket
		// and no status: an example is not a thing the tracker knows about, it is
		// what makes the story true.
		let delivery: string | null = null;
		let deliverySpan: Span | null = null;
		while (at('at')) {
			const sigil = advance();
			const name = parseReference(sigil, 'this example', 'a delivery');
			if (name === null) continue;
			if (delivery !== null) {
				problemAt(sigil, 'This example names two deliveries.', 'An example ships once.');
				continue;
			}
			delivery = name;
			deliverySpan = spanFrom(sigil);
		}

		const notes: string[] = [];
		const run = noteRun();
		const steps: Record<StepClause, string[]> = { given: [], when: [], then: [] };
		const stepSpans: Record<StepClause, Span[]> = { given: [], when: [], then: [] };
		const body = parseBody('example', () => parseStep(steps, stepSpans) || parseNote(notes, run));
		examples.push({
			title: title.value,
			notes,
			delivery,
			given: steps.given,
			when: steps.when,
			then: steps.then,
			steps: stepSpans,
			spans: {
				span: spanFrom(keyword),
				titleSpan: tokenSpan(title),
				annotations: { release: deliverySpan, ticket: null, status: null },
				openBrace: body?.open ?? -1,
				notesSpan: runSpan(run),
			},
		});
		return true;
	}

	function parseRule(rules: RuleNode[]): boolean {
		if (!at('keyword', 'rule')) return false;
		const keyword = advance();
		const title = expectString('rule', 'A rule is quoted: rule "A voucher must not be expired"');
		if (title === undefined) {
			synchronize();
			return true;
		}

		const notes: string[] = [];
		const examples: ExampleNode[] = [];
		const questions: QuestionNode[] = [];
		const run = noteRun();
		const body = parseBody(
			'rule',
			() => parseExample(examples) || parseQuestion(questions) || parseNote(notes, run),
		);
		rules.push({
			title: title.value,
			notes,
			examples,
			questions,
			spans: {
				span: spanFrom(keyword),
				titleSpan: tokenSpan(title),
				annotations: NO_ANNOTATIONS,
				openBrace: body?.open ?? -1,
				notesSpan: runSpan(run),
			},
		});
		return true;
	}

	/**
	 * One clause of the story's need: `as`, `want` or `so`.
	 *
	 * Whitespace inside is collapsed, which is what makes a clause spelled across
	 * two lines with a trailing backslash read back as one line of prose. Each
	 * clause is one clause of one sentence, so a break inside it would be a break
	 * in the middle of the sentence the card composes.
	 *
	 * A repeat is an error rather than a last-one-wins. A story written for two
	 * personas is two stories, and an example mapping session that produced one
	 * has found something worth stopping for.
	 */
	function parseClause(
		word: 'as' | 'want' | 'so',
		need: { persona: string | null; want: string | null; soThat: string | null },
		field: 'persona' | 'want' | 'soThat',
		hint: string,
		spans?: { persona: Span | null; want: Span | null; soThat: Span | null },
	): boolean {
		if (!at('keyword', word)) return false;
		const keyword = advance();
		const value = expectString(word, hint);
		if (value === undefined) {
			synchronize();
			return true;
		}
		if (need[field] !== null) {
			problemAt(
				keyword,
				`This story states \`${word}\` twice.`,
				'A story is written for one person, wanting one thing, for one reason.',
			);
			return true;
		}
		need[field] = value.value.replace(/\s+/g, ' ').trim();
		if (spans) spans[field] = spanFrom(keyword, value);
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
		state: { value: string | null; token: Token | null; span: Span | null },
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
		state.value = value.value;
		state.token = keyword;
		state.span = spanFrom(keyword, value);
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
	function parseStoryAnnotations(): {
		ticket: string | null;
		status: StoryStatus;
		release: string | null;
		spans: AnnotationSpans;
	} {
		let ticket: string | null = null;
		let status: StoryStatus | null = null;
		// Each annotation's own span, sigil included, so setting a status leaves
		// the ticket beside it on the same line alone.
		const spans: { release: Span | null; ticket: Span | null; status: Span | null } = {
			release: null,
			ticket: null,
			status: null,
		};
		let release: string | null = null;

		while (at('at') || at('hash') || at('tilde')) {
			const sigil = advance();

			if (sigil.kind === 'at') {
				const name = parseReference(sigil, 'the story', 'a release');
				if (name === null) continue;
				if (release !== null) {
					problemAt(sigil, 'This story names two deliveries.', 'A story ships once.');
					continue;
				}
				release = name;
				spans.release = spanFrom(sigil);
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
				const found = advance();
				const value = found.value;
				if (ticket !== null) {
					problemAt(sigil, 'This story names two tickets.', 'A story links to one ticket.');
					continue;
				}
				ticket = value;
				spans.ticket = spanFrom(sigil, found);
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
			spans.status = spanFrom(sigil, word);
		}

		// Unlinked, unscheduled, and nothing said about it yet.
		return { ticket, status: status ?? DEFAULT_STORY_STATUS, release, spans };
	}

	/**
	 * One `@delivery` reference: the name, recorded for phase 2 to check.
	 *
	 * Bare when the scanner reads it as one token, quoted when it does not —
	 * `@MVP` and `@"Sprint 1"` are the same reference written two ways, exactly as
	 * doc-sm spells its releases.
	 *
	 * Returns `null` when there was nothing usable after the sigil, and the caller
	 * carries on: an example with a malformed reference is still an example, and
	 * the rest of the card is still worth reading.
	 */
	function parseReference(sigil: Token, owner: string, expected: string): string | null {
		if (!at('ident') && !at('string')) {
			problemAt(
				sigil,
				`Expected a delivery name after \`@\`, found ${describe(peek())}.`,
				`Write @Sprint1, or @"Sprint 1" when the name has spaces in it.`,
			);
			return null;
		}
		const name = advance();
		references.push({ name: name.value, token: sigil, what: `${owner} ships in ${expected}` });
		return name.value;
	}

	/**
	 * `delivery "Sprint 1" sprint` — one band of the timeline.
	 *
	 * The kind is required rather than defaulted. A defaulted kind would make the
	 * common case shorter and the *meaning* of a bare `delivery` line depend on
	 * which default was chosen months ago; two words is a small price for a line
	 * that reads as what it is.
	 */
	function parseDelivery(): boolean {
		if (!at('keyword', 'delivery')) return false;
		const keyword = advance();
		const title = expectString('delivery', 'A delivery is quoted: delivery "Sprint 1" sprint');
		if (title === undefined) {
			synchronize();
			return true;
		}

		let kind: DeliveryKind = 'sprint';
		// The keyword stands in when the kind word is missing, so a change of kind
		// still has somewhere to write.
		let kindSpan: Span = tokenSpan(keyword);
		if (!at('keyword') || !isDeliveryKind(peek().value)) {
			problemAt(
				peek(),
				`Expected ${DELIVERY_KINDS.join(' or ')} after the delivery's name, found ${describe(peek())}.`,
				'A delivery says which it is: delivery "1.0" release',
			);
		} else {
			const word = advance();
			kind = word.value as DeliveryKind;
			kindSpan = tokenSpan(word);
		}

		// `#ticket` and `points N` after the kind, in either order. A band takes no
		// `~status` — where a sprint is in its own lifecycle is the tracker's
		// business, and a board that cached it would be claiming to know something
		// it never asks about. It takes no `@` either: a delivery is a point on the
		// timeline, not a thing placed on one.
		let ticket: string | null = null;
		let ticketSpan: Span | null = null;
		let points: number | null = null;
		let pointsSpan: Span | null = null;

		while (at('hash') || at('keyword', 'points')) {
			if (at('hash')) {
				const sigil = advance();
				if (!at('ident') && !at('string')) {
					problemAt(
						sigil,
						`Expected a ticket id after \`#\`, found ${describe(peek())}.`,
						'Write the id the ticketing system issued: #CLONB-S24',
					);
					continue;
				}
				const found = advance();
				if (ticket !== null) {
					problemAt(sigil, 'This delivery names two tickets.', 'A delivery links to one ticket.');
					continue;
				}
				ticket = found.value;
				ticketSpan = spanFrom(sigil, found);
				continue;
			}

			const word = advance();

			// A release is a date, and the work in it is the sprints leading there.
			// Sizing it would either double-count those or state a competing number
			// for the same work — so this is refused rather than ignored.
			if (kind !== 'sprint') {
				problemAt(
					word,
					'Only a sprint is sized in story points.',
					'A release is delivered by the sprints before it; size those instead.',
				);
				if (at('ident')) advance();
				continue;
			}

			if (!at('ident') || !/^\d+$/.test(peek().value)) {
				problemAt(
					word,
					`Expected a whole number of story points, found ${describe(peek())}.`,
					'Points are a non-negative whole number: points 13',
				);
				if (at('ident') || at('string')) advance();
				continue;
			}

			const ordinal = advance();
			const value = Number(ordinal.value);
			if (points !== null) {
				problemAt(word, 'This sprint is sized twice.', 'A sprint has one estimate.');
				continue;
			}
			points = value;
			pointsSpan = spanFrom(word, ordinal);
		}

		const notes: string[] = [];
		const run = noteRun();
		const body = parseBody('delivery', () => parseNote(notes, run));
		deliveries.push({
			node: {
				title: title.value,
				kind,
				ticket,
				points,
				notes,
				kindSpan,
				pointsSpan,
				spans: {
					span: spanFrom(keyword),
					titleSpan: tokenSpan(title),
					annotations: { release: null, ticket: ticketSpan, status: null },
					openBrace: body?.open ?? -1,
					notesSpan: runSpan(run),
				},
			},
			token: keyword,
		});
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

		const { ticket, status, release, spans } = parseStoryAnnotations();
		const notes: string[] = [];
		const run = noteRun();
		const clauseSpans: { persona: Span | null; want: Span | null; soThat: Span | null } = {
			persona: null,
			want: null,
			soThat: null,
		};
		const questions: QuestionNode[] = [];
		const need: { persona: string | null; want: string | null; soThat: string | null } = {
			persona: null,
			want: null,
			soThat: null,
		};

		// The clauses are read before the node is built, so a `want` written after
		// a question still lands on the story — the body has no order.
		const body = parseBody(
			'story',
			() =>
				parseClause('as', need, 'persona', 'Who the story is for, quoted: as "Support engineer"', clauseSpans) ||
				parseClause('want', need, 'want', 'What they want, quoted: want "to redeem a voucher at checkout"', clauseSpans) ||
				parseClause('so', need, 'soThat', 'The outcome, quoted: so "the discount comes off the basket"', clauseSpans) ||
				parseQuestion(questions) ||
				parseNote(notes, run),
		);

		const node: StoryNode = {
			title: title.value,
			notes,
			ticket,
			status,
			release,
			persona: need.persona,
			want: need.want,
			soThat: need.soThat,
			questions,
			personaSpan: clauseSpans.persona,
			wantSpan: clauseSpans.want,
			soThatSpan: clauseSpans.soThat,
			spans: {
				span: spanFrom(keyword),
				titleSpan: tokenSpan(title),
				annotations: spans,
				openBrace: body?.open ?? -1,
				notesSpan: runSpan(run),
			},
		};

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
			return blank('Untitled example map', source);
		}

		let title = 'Untitled example map';
		let titleSpan: Span = tokenSpan(peek());
		let openBrace = -1;
		const run = noteRun();
		const product: { value: string | null; token: Token | null; span: Span | null } = {
			value: null,
			token: null,
			span: null,
		};
		const space: { value: string | null; token: Token | null; span: Span | null } = {
			value: null,
			token: null,
			span: null,
		};
		const notes: string[] = [];
		const rules: RuleNode[] = [];
		const story: { value: StoryNode | null; token: Token | null } = { value: null, token: null };

		if (at('keyword', 'examplemap')) {
			advance();
			const parsed = expectString('examplemap', 'The map is titled: examplemap "Redeem a voucher"');
			if (parsed !== undefined) {
				title = parsed.value;
				titleSpan = tokenSpan(parsed);
			}
			const body = parseBody(
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
					parseDelivery() ||
					parseStory(story) ||
					parseRule(rules) ||
					parseNote(notes, run),
			);
			openBrace = body?.open ?? -1;
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

		// Phase 2: what only makes sense once the whole file has been read.
		resolveDeliveries();

		return {
			title,
			titleSpan,
			productSpan: product.span,
			spaceSpan: space.span,
			openBrace,
			notesSpan: runSpan(run),
			source,
			product: product.value,
			space: space.value,
			notes: [...notes],
			deliveries: deliveries.map((entry) => entry.node),
			// A map with no `story` line is not an error: it is a session that has
			// not named its story yet, which is exactly what a fresh board is. It
			// stays absent rather than becoming a placeholder card nobody wrote.
			story: story.value,
			rules,
		};
	}

	/**
	 * The two checks that need the whole file: duplicate bands, dangling
	 * references.
	 *
	 * **Duplicate titles are an error**, and that decision is what licenses
	 * storing a reference as a title at all. If two bands could be called
	 * "Sprint 1" then `@"Sprint 1"` would not name one of them, and every reader
	 * — this parser, the board, a person — would have to guess. The two decisions
	 * stand or fall together.
	 *
	 * **A reference to a delivery that was never declared is an error** rather
	 * than a silent drop. Dropping it would quietly unschedule somebody's work and
	 * the export would then make that permanent, which is the one failure mode a
	 * round-tripping format must not have. It is reported at the `@`, and the hint
	 * lists what was actually declared — a misspelling is the usual cause, and the
	 * fix is then visible without leaving the message.
	 */
	function resolveDeliveries(): void {
		const seen = new Map<string, Token>();
		for (const { node, token } of deliveries) {
			const first = seen.get(node.title);
			if (first !== undefined) {
				problemAt(
					token,
					`Two deliveries are called ${JSON.stringify(node.title)}.`,
					`Already declared on line ${first.line}. \`@\` names a delivery by its title, so titles have to be unique.`,
				);
				continue;
			}
			seen.set(node.title, token);
		}

		for (const reference of references) {
			if (seen.has(reference.name)) continue;
			const known = [...seen.keys()];
			problemAt(
				reference.token,
				`No delivery is called ${JSON.stringify(reference.name)}, but ${reference.what}.`,
				known.length === 0
					? 'Declare it first: delivery "Sprint 1" sprint'
					: `Declared: ${known.map((title) => JSON.stringify(title)).join(', ')}.`,
			);
		}
	}

	return { parseFile };
}

/** A map that was not there. Every span is empty, and so is the source. */
function blank(title: string, source: string): ExampleMapDocument {
	return {
		title,
		titleSpan: NOWHERE,
		product: null,
		productSpan: null,
		space: null,
		spaceSpan: null,
		notes: [],
		notesSpan: null,
		deliveries: [],
		story: null,
		rules: [],
		openBrace: -1,
		source,
	};
}
