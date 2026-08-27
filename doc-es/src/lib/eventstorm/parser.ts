/**
 * The `.eventstorm` parser — recursive descent over the token array.
 *
 * The shortest of the three, because a Big Picture wall is the simplest thing
 * any of these boards models: a title, a product, and a set of swimlanes
 * holding coloured notes at points along one shared timeline. There is no reference to resolve and no second
 * phase — nothing in this grammar points at anything else, so everything can be
 * decided as it is read.
 *
 * That will change at the Software Design level, where an aggregate gathers the
 * commands it handles. When it does, doc-sm's two-phase shape is the one to
 * copy: build raw nodes carrying the position a reference was written at, and
 * resolve once the whole file has been read, so a declaration may follow its
 * first use.
 *
 * Errors are collected rather than fatal, for the reason the other two give:
 * these files are hand-edited in an editor with no language server and imported
 * through a file picker, so failing on the first problem costs one trip through
 * a file dialog per typo.
 */

import { tokenize, type Token, type TokenKind } from './lexer.ts';
import {
	CARD_KINDS,
	cardKeyword,
	cardLabel,
	emptyLane,
	isCardKind,
	isLevel,
	kindsFor,
	LEVELS,
	levelLabel,
	levelOfKind,
	wrapNote,
	type CardKind,
	type CardNode,
	type EventStormDocument,
	type LaneNode,
	type Level,
	type Span,
} from './model.ts';
import { EventStormParseError, isSaturated, report, type Problem } from './problems.ts';

/**
 * Read an event storm.
 *
 * @throws {EventStormParseError} carrying every problem found, not just the first.
 */
export function parse(source: string): EventStormDocument {
	const problems: Problem[] = [];
	const tokens = tokenize(source, problems);
	const document = createParser(tokens, problems, source).parseFile();

	if (problems.length > 0) throw new EventStormParseError(problems);
	return document;
}

/** What each kind looks like written properly, for the error hint. */
const cardExample: Record<CardKind, string> = {
	event: 'event "Order placed"',
	actor: 'actor "Customer"',
	system: 'system "Payment provider"',
	hotspot: 'hotspot "Nobody agrees what \\"confirmed\\" means"',
	opportunity: 'opportunity "Tell the customer sooner"',
	command: 'command "Place the order"',
	policy: 'policy "Whenever payment is refused, hold the order"',
	readmodel: 'readmodel "Basket total"',
	aggregate: 'aggregate "Order"',
	ui: 'ui "Checkout page"',
	context: 'context "Ordering"',
};

function createParser(tokens: readonly Token[], problems: Problem[], source: string) {
	let position = 0;

	const peek = (ahead = 0): Token => tokens[Math.min(position + ahead, tokens.length - 1)]!;
	const at = (kind: TokenKind, value?: string): boolean => {
		const token = peek();
		return token.kind === kind && (value === undefined || token.value === value);
	};
	const advance = (): Token => tokens[Math.min(position++, tokens.length - 1)]!;
	const atDeclaration = (): boolean => at('keyword') && peek().value !== 'eventstorm';

	/** Every card written, with its keyword's position, for the level check. */
	const placed: { kind: CardKind; token: Token }[] = [];

	/*
	 * Spans, built from what the lexer already records.
	 *
	 * Every token carries `offset` and `length`, so nothing here needed a change
	 * to the lexer: a span is two arithmetic operations on tokens the parser is
	 * holding anyway. `line` and `column` come from the *first* token, because
	 * that is where a problems entry points and where the editor scrolls to.
	 */
	const tokenSpan = (token: Token): Span => ({
		start: token.offset,
		end: token.offset + token.length,
		line: token.line,
		column: token.column,
	});

	/** The last token consumed — where a declaration that just closed ends. */
	const previous = (): Token => tokens[Math.max(0, Math.min(position - 1, tokens.length - 1))]!;

	/** From one token through whatever was consumed last. */
	const spanFrom = (from: Token, to: Token = previous()): Span => ({
		start: from.offset,
		end: Math.max(from.offset + from.length, to.offset + to.length),
		line: from.line,
		column: from.column,
	});

	function problemAt(token: Token, message: string, hint?: string): void {
		report(problems, { message, line: token.line, column: token.column, length: token.length, hint });
	}

	/**
	 * The quoted string, as a token rather than as its text.
	 *
	 * The token, because every caller now needs two things from it: the value,
	 * and where it sits — a rename is a splice over exactly these bytes and
	 * nothing else on the line.
	 */
	function expectString(after: string, hint: string): Token | undefined {
		if (!at('string')) {
			problemAt(peek(), `Expected a quoted title after \`${after}\`, found ${describe(peek())}.`, hint);
			return undefined;
		}
		return advance();
	}

	/**
	 * Skip to something that can start a declaration.
	 *
	 * Panic-mode recovery, and the reason a file with six mistakes costs one trip
	 * through the file dialog rather than six.
	 */
	function synchronize(): void {
		let depth = 0;
		while (!at('eof') && !isSaturated(problems)) {
			if (at('lbrace')) depth += 1;
			else if (at('rbrace')) {
				if (depth === 0) return;
				depth -= 1;
			} else if (depth === 0 && atDeclaration()) return;
			advance();
		}
	}

	/**
	 * A `{ … }` body, and where its braces are.
	 *
	 * The offsets are what lets a new declaration be written *inside* an existing
	 * block: a card added to a lane is spliced one step in from the lane's `{`,
	 * and a lane with no block at all has to grow one. Null means the declaration
	 * was written without a body.
	 */
	function parseBody(owner: string, item: () => boolean): { open: number; close: number } | null {
		if (!at('lbrace')) return null;
		const open = advance();

		while (!at('rbrace') && !at('eof') && !isSaturated(problems)) {
			if (item()) continue;
			problemAt(peek(), `Unexpected ${describe(peek())} inside \`${owner}\`.`);
			synchronize();
			if (!at('rbrace') && !at('eof') && !atDeclaration()) advance();
		}

		if (at('rbrace')) {
			const close = advance();
			return { open: open.offset, close: close.offset + close.length };
		}

		problemAt(peek(), `\`${owner}\` is not closed — no \`}\` before the end of the file.`);
		return { open: open.offset, close: source.length };
	}

	function parseNote(notes: string[], span?: { first: Token | null; last: Token | null }): boolean {
		if (!at('keyword', 'note')) return false;
		const keyword = advance();
		const text = expectString('note', 'A note is quoted: note "Two departments mean different things here."');
		if (text === undefined) {
			synchronize();
			return true;
		}
		notes.push(wrapNote(text.value));
		// The run of `note` lines, first keyword to last string: what a rewrite of
		// the notes replaces, and where a first note is inserted when there are
		// none. Tracked here because only this function knows which lines they are.
		if (span) {
			span.first ??= keyword;
			span.last = text;
		}
		return true;
	}

	/**
	 * One sticky note, of whichever of the five kinds its keyword names.
	 *
	 * One function for all five rather than five near-identical ones, because on
	 * a Big Picture wall they differ only in what the colour means. The keyword
	 * *is* the kind, so there is nothing to disambiguate and nothing to get
	 * wrong — which is also why there is no `~kind` annotation: a card whose
	 * keyword said one thing and whose annotation said another would be a state
	 * the format could express and the board could not.
	 */
	function parseCard(cards: CardNode[]): boolean {
		if (!at('keyword') || !isCardKind(peek().value)) return false;
		const keyword = advance();
		const kind = keyword.value as CardKind;
		const title = expectString(cardKeyword[kind], `Written in the room’s own words: ${cardExample[kind]}`);
		if (title === undefined) {
			synchronize();
			return true;
		}

		/*
		 * `@column`, or the next square along from the last card written here.
		 *
		 * Optional on the way in and always written on the way out. A run of
		 * events typed straight down a lane is the common case and should not
		 * have to be numbered by hand; a card that genuinely belongs at column 7
		 * because that is when it happens has to be able to say so. Defaulting to
		 * "one after the previous" makes the terse form mean the obvious thing.
		 *
		 * `@0` and below are refused rather than clamped. Columns are one-based
		 * because they are positions on a wall, not array indices, and a silently
		 * corrected coordinate is a card that is not where the file says it is.
		 */
		let column = nextColumn(cards);
		let columnSpan: Span | null = null;
		while (at('at')) {
			const sigil = advance();
			if (!at('ident') || !/^\d+$/.test(peek().value)) {
				problemAt(
					sigil,
					`Expected a column number after \`@\`, found ${describe(peek())}.`,
					'A column is a whole number from 1: event "Order placed" @3',
				);
				continue;
			}
			const ordinal = advance();
			const value = Number(ordinal.value);
			if (value < 1) {
				problemAt(sigil, 'Columns start at 1.', 'Column 1 is the left-hand edge of the wall.');
				continue;
			}
			column = value;
			// `@` through the digits, so a move replaces the whole annotation
			// rather than leaving a stray sigil behind.
			columnSpan = spanFrom(sigil, ordinal);
		}

		const notes: string[] = [];
		const noteRun: { first: Token | null; last: Token | null } = { first: null, last: null };
		// Where this card was written, so a level mismatch can be reported at the
		// keyword rather than at the top of the file. Cleared as the tree is built;
		// nothing outside this parser sees it.
		placed.push({ kind, token: keyword });
		// Pushed *after* the body rather than before it, which is the one shape
		// change spans forced: a declaration's span is not known until its closing
		// brace has been read.
		parseBody(cardKeyword[kind], () => parseNote(notes, noteRun));
		cards.push({
			kind,
			title: title.value,
			column,
			notes,
			span: spanFrom(keyword),
			kindSpan: tokenSpan(keyword),
			titleSpan: tokenSpan(title),
			columnSpan,
			notesSpan: noteRun.first === null ? null : spanFrom(noteRun.first, noteRun.last ?? noteRun.first),
		});
		return true;
	}

	/** One past the rightmost column written so far in this lane, or 1. */
	function nextColumn(cards: readonly CardNode[]): number {
		let last = 0;
		for (const card of cards) if (card.column > last) last = card.column;
		return last + 1;
	}

	/**
	 * `lane "Customer"` — one swimlane.
	 *
	 * A lane may hold cards and nothing else. Nesting one lane inside another
	 * would be describing a hierarchy the board does not have: the board is a
	 * grid, and a lane is a row of it.
	 */
	function parseLane(lanes: LaneNode[]): boolean {
		if (!at('keyword', 'lane')) return false;
		const keyword = advance();
		const title = expectString('lane', 'A lane is quoted: lane "Customer"');
		if (title === undefined) {
			synchronize();
			return true;
		}

		const notes: string[] = [];
		const cards: CardNode[] = [];
		const noteRun: { first: Token | null; last: Token | null } = { first: null, last: null };
		const body = parseBody('lane', () => parseCard(cards) || parseNote(notes, noteRun));
		lanes.push({
			title: title.value,
			notes,
			cards,
			span: spanFrom(keyword),
			titleSpan: tokenSpan(title),
			// -1 for a lane written with no block. `addCard` grows one rather than
			// splicing into a brace that is not there.
			openBrace: body?.open ?? -1,
			notesSpan: noteRun.first === null ? null : spanFrom(noteRun.first, noteRun.last ?? noteRun.first),
		});
		return true;
	}

	/**
	 * `level process-modelling` — at most one per storm, big picture by default.
	 *
	 * A bare word rather than a quoted string, because it is one of three fixed
	 * values rather than free text: `level "big-pcture"` should be caught here
	 * and not become a storm nobody can open.
	 *
	 * Omitting it means big picture, which is where the practice starts and what
	 * a file written before this setting existed was. That default is the reason
	 * older files keep opening.
	 */
	function parseLevel(state: { value: Level | null; token: Token | null; span: Span | null }): boolean {
		if (!at('keyword', 'level')) return false;
		const keyword = advance();

		if (!at('ident') || !isLevel(peek().value)) {
			problemAt(
				peek(),
				`Expected a level after \`level\`, found ${describe(peek())}.`,
				`One of: ${LEVELS.join(', ')}.`,
			);
			synchronize();
			return true;
		}
		const ordinal = advance();
		const value = ordinal.value as Level;

		if (state.token !== null) {
			problemAt(
				keyword,
				'The level is declared twice. A storm is run at one level.',
				`Already declared on line ${state.token.line}.`,
			);
			return true;
		}
		state.value = value;
		state.token = keyword;
		state.span = spanFrom(keyword, ordinal);
		return true;
	}

	/**
	 * Every card the declared level has no colour for.
	 *
	 * A mismatch is an error rather than a silent promotion of the level. The
	 * level is a statement about which workshop this is, and quietly deepening it
	 * because somebody wrote one `command` would change what the file claims
	 * about itself without anybody deciding to. Reported at each offending
	 * keyword, with the level that would admit it — so the fix is one word, and
	 * the message says which word.
	 */
	function checkLevel(level: Level): void {
		const allowed = new Set(kindsFor(level));
		for (const { kind, token } of placed) {
			if (allowed.has(kind)) continue;
			problemAt(
				token,
				`A ${cardLabel[kind].toLowerCase()} is not part of ${levelLabel[level].toLowerCase()} event storming.`,
				`It arrives with ${levelLabel[levelOfKind[kind]].toLowerCase()}. Write \`level ${levelOfKind[kind]}\` at the top of the storm.`,
			);
		}
	}

	/**
	 * `product "client-onboarding"` — at most one per storm.
	 *
	 * A second is an error rather than a last-one-wins overwrite: a storm is
	 * about one product, and two declarations mean a bad merge, which is exactly
	 * the thing worth surfacing rather than silently resolving.
	 */
	function parseProduct(state: {
		value: string | null;
		token: Token | null;
		span: Span | null;
	}): boolean {
		if (!at('keyword', 'product')) return false;
		const keyword = advance();
		const value = expectString('product', 'A product is its shortname, quoted: product "client-onboarding"');
		if (value === undefined) {
			synchronize();
			return true;
		}
		if (state.token !== null) {
			problemAt(
				keyword,
				'The product is declared twice. An event storm is about one product.',
				`Already declared on line ${state.token.line}.`,
			);
			return true;
		}
		state.value = value.value;
		state.token = keyword;
		state.span = spanFrom(keyword, value);
		return true;
	}

	function parseFile(): EventStormDocument {
		while (!at('eof') && !at('keyword', 'eventstorm')) {
			problemAt(
				peek(),
				`Expected \`eventstorm\`, found ${describe(peek())}.`,
				'A file holds one event storm: eventstorm "Its title" { … }',
			);
			synchronize();
			if (!at('eof') && !at('keyword', 'eventstorm') && !atDeclaration()) advance();
			else if (atDeclaration()) break;
		}

		if (at('eof')) {
			if (problems.length === 0) {
				report(problems, {
					message: 'The file is empty.',
					line: 1,
					column: 1,
					length: 0,
					hint: 'An event storm starts with: eventstorm "Its title" { … }',
				});
			}
			return blank('Untitled event storm', source);
		}

		let title = 'Untitled event storm';
		let titleSpan: Span = tokenSpan(peek());
		let openBrace = -1;
		const product: { value: string | null; token: Token | null; span: Span | null } = {
			value: null,
			token: null,
			span: null,
		};
		const level: { value: Level | null; token: Token | null; span: Span | null } = {
			value: null,
			token: null,
			span: null,
		};
		const notes: string[] = [];
		const noteRun: { first: Token | null; last: Token | null } = { first: null, last: null };
		const lanes: LaneNode[] = [];
		/*
		 * Cards written at the top level, before any `lane` line.
		 *
		 * Legal, and the shape a real file takes early: chaotic exploration
		 * produces a heap of events long before anybody agrees where one stretch
		 * of the wall ends and the next begins. They are gathered into a single
		 * unnamed lane below, so the board always has a row to put them on.
		 */
		const loose: CardNode[] = [];

		if (at('keyword', 'eventstorm')) {
			advance();
			const parsed = expectString('eventstorm', 'The storm is titled: eventstorm "Ordering a pizza"');
			if (parsed !== undefined) {
				title = parsed.value;
				titleSpan = tokenSpan(parsed);
			}
			const body = parseBody(
				'eventstorm',
				() =>
					parseProduct(product) ||
					parseLevel(level) ||
					parseLane(lanes) ||
					parseCard(loose) ||
					parseNote(notes, noteRun),
			);
			openBrace = body?.open ?? -1;
		}

		while (!at('eof')) {
			if (at('keyword', 'eventstorm')) {
				problemAt(
					peek(),
					'A second `eventstorm` block.',
					'One file holds one event storm. Split them into two files.',
				);
			} else {
				problemAt(peek(), `Unexpected ${describe(peek())} after the event storm.`);
			}
			synchronize();
			if (!at('eof') && !at('keyword', 'eventstorm')) advance();
		}

		// Loose cards go in a lane of their own, above the named ones. They were
		// written before anybody drew a lane, and appending them to somebody's
		// first lane would be claiming they belong to it.
		const all = loose.length > 0 ? [{ ...emptyLane(), cards: loose }, ...lanes] : lanes;

		// Every card is known by now, so the level can be checked against all of
		// them at once rather than as each is read — which is what lets `level` be
		// written at the bottom of the file as well as the top.
		const chosen = level.value ?? 'big-picture';
		checkLevel(chosen);

		return {
			title,
			titleSpan,
			product: product.value,
			productSpan: product.span,
			levelSpan: level.span,
			openBrace,
			notesSpan: noteRun.first === null ? null : spanFrom(noteRun.first, noteRun.last ?? noteRun.first),
			source,
			level: chosen,
			notes: [...notes],
			// No lanes is a legal storm: a file that names none is one nobody has
			// drawn a wall on yet, and the board offers the choice rather than
			// inventing a lane to hold the emptiness.
			lanes: all,
		};
	}

	return { parseFile };
}

const NOWHERE: Span = { start: 0, end: 0, line: 1, column: 1 };

/**
 * A storm that was not there.
 *
 * Every span is empty and `source` is empty with them, which is the honest
 * answer: there is no text, so there is nowhere for a gesture to splice. The
 * board renders the empty state on this and offers to make a real one.
 */
function blank(title: string, source: string): EventStormDocument {
	return {
		title,
		titleSpan: NOWHERE,
		product: null,
		productSpan: null,
		level: 'big-picture',
		levelSpan: null,
		notes: [],
		notesSpan: null,
		lanes: [],
		openBrace: -1,
		source,
	};
}

function describe(token: Token): string {
	if (token.kind === 'eof') return 'the end of the file';
	if (token.kind === 'string') return `the title ${JSON.stringify(token.value)}`;
	if (token.kind === 'keyword') return `\`${token.value}\``;
	if (token.kind === 'lbrace' || token.kind === 'rbrace') return `\`${token.value}\``;
	return `\`${token.value}\``;
}

/** Every kind's keyword, for an error that has to list them. */
export const CARD_KEYWORDS: readonly string[] = CARD_KINDS.map((kind) => cardKeyword[kind]);
