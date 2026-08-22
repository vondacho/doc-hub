/**
 * The `.eventstorm` parser — recursive descent over the token array.
 *
 * The shortest of the three, because a Big Picture wall is the simplest thing
 * any of these boards models: a title, a product, and a run of phases holding
 * coloured notes in time order. There is no reference to resolve and no second
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
	emptyPhase,
	isCardKind,
	UNNAMED_PHASE,
	wrapNote,
	type CardKind,
	type CardNode,
	type EventStormDocument,
	type PhaseNode,
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
	const document = createParser(tokens, problems).parseFile();

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
};

function createParser(tokens: readonly Token[], problems: Problem[]) {
	let position = 0;

	const peek = (ahead = 0): Token => tokens[Math.min(position + ahead, tokens.length - 1)]!;
	const at = (kind: TokenKind, value?: string): boolean => {
		const token = peek();
		return token.kind === kind && (value === undefined || token.value === value);
	};
	const advance = (): Token => tokens[Math.min(position++, tokens.length - 1)]!;
	const atDeclaration = (): boolean => at('keyword') && peek().value !== 'eventstorm';

	function problemAt(token: Token, message: string, hint?: string): void {
		report(problems, { message, line: token.line, column: token.column, length: token.length, hint });
	}

	function expectString(after: string, hint: string): string | undefined {
		if (!at('string')) {
			problemAt(peek(), `Expected a quoted title after \`${after}\`, found ${describe(peek())}.`, hint);
			return undefined;
		}
		return advance().value;
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

	function parseBody(owner: string, item: () => boolean): void {
		if (!at('lbrace')) return;
		advance();

		while (!at('rbrace') && !at('eof') && !isSaturated(problems)) {
			if (item()) continue;
			problemAt(peek(), `Unexpected ${describe(peek())} inside \`${owner}\`.`);
			synchronize();
			if (!at('rbrace') && !at('eof') && !atDeclaration()) advance();
		}

		if (at('rbrace')) advance();
		else problemAt(peek(), `\`${owner}\` is not closed — no \`}\` before the end of the file.`);
	}

	function parseNote(notes: string[]): boolean {
		if (!at('keyword', 'note')) return false;
		advance();
		const text = expectString('note', 'A note is quoted: note "Two departments mean different things here."');
		if (text === undefined) {
			synchronize();
			return true;
		}
		notes.push(wrapNote(text));
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

		const notes: string[] = [];
		cards.push({ kind, title, notes });
		parseBody(cardKeyword[kind], () => parseNote(notes));
		return true;
	}

	/**
	 * `phase "Checkout"` — one stretch of the wall.
	 *
	 * A phase may hold cards and nothing else. Nesting one phase inside another
	 * would be describing a hierarchy the wall does not have: the wall is a line,
	 * and a phase is a stretch of it.
	 */
	function parsePhase(phases: PhaseNode[]): boolean {
		if (!at('keyword', 'phase')) return false;
		advance();
		const title = expectString('phase', 'A phase is quoted: phase "Checkout"');
		if (title === undefined) {
			synchronize();
			return true;
		}

		const notes: string[] = [];
		const cards: CardNode[] = [];
		phases.push({ title, notes, cards });
		parseBody('phase', () => parseCard(cards) || parseNote(notes));
		return true;
	}

	/**
	 * `product "client-onboarding"` — at most one per storm.
	 *
	 * A second is an error rather than a last-one-wins overwrite: a storm is
	 * about one product, and two declarations mean a bad merge, which is exactly
	 * the thing worth surfacing rather than silently resolving.
	 */
	function parseProduct(state: { value: string | null; token: Token | null }): boolean {
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
		state.value = value;
		state.token = keyword;
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
			return blank('Untitled event storm');
		}

		let title = 'Untitled event storm';
		const product: { value: string | null; token: Token | null } = { value: null, token: null };
		const notes: string[] = [];
		const phases: PhaseNode[] = [];
		/*
		 * Cards written at the top level, before any `phase` line.
		 *
		 * Legal, and the shape a real file takes early: chaotic exploration
		 * produces a heap of events long before anybody agrees where one stretch
		 * of the wall ends and the next begins. They are gathered into a single
		 * unnamed phase below, so the board always has a wall to put them on.
		 */
		const loose: CardNode[] = [];

		if (at('keyword', 'eventstorm')) {
			advance();
			const parsed = expectString('eventstorm', 'The storm is titled: eventstorm "Ordering a pizza"');
			if (parsed !== undefined) title = parsed;
			parseBody(
				'eventstorm',
				() => parseProduct(product) || parsePhase(phases) || parseCard(loose) || parseNote(notes),
			);
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

		// Loose cards go in front of the named phases, because they were written
		// before anybody drew a boundary — and because a card silently appended to
		// somebody's last phase would be claiming it belongs there.
		const all = loose.length > 0 ? [{ ...emptyPhase(), cards: loose }, ...phases] : phases;

		return {
			title,
			product: product.value,
			notes: [...notes],
			// A board always has a wall, even an empty one: the practice starts with
			// paper on a wall, and the first `+` needs somewhere to be.
			phases: all.length > 0 ? all : [emptyPhase()],
		};
	}

	return { parseFile };
}

function blank(title: string): EventStormDocument {
	return { title, product: null, notes: [], phases: [emptyPhase()] };
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
