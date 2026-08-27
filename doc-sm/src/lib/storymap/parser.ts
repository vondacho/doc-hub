/**
 * The `.storymap` parser — recursive descent over the token array.
 *
 * Two phases, and the split is what makes the error messages good.
 *
 *   1. parse    builds the tree, carrying each `@Release` reference as a raw
 *               name plus the position it was written at.
 *   2. resolve  validates what only makes sense once the whole file is read:
 *               duplicate delivery titles, references to deliveries that were
 *               never declared, a second `storymap` block, no block at all.
 *
 * Phase 2 is why a `delivery` declaration may appear *after* the activity that
 * references it. A hand-editor adding a band at the bottom of the file is not
 * doing anything wrong, and a single-pass parser would punish them for it.
 *
 * Errors are collected rather than fatal. The argument is worth stating because
 * the opposite is the usual default: these files are written in an editor with
 * no language server, no squiggles and no live feedback, then imported through a
 * file picker. Failing on the first problem means one round trip through a file
 * dialog per typo, so a map with six mistakes costs six trips. Panic-mode
 * recovery costs a dozen lines and turns that into one.
 *
 * Module-private closure rather than a class, matching the plain-functions style
 * of doc-portal's src/lib/products.ts. The only class in this repo is an Error
 * subclass, and problems.ts adds the second for the same reason.
 */

import { STORYMAP_KEYWORDS, tokenize, type Token, type TokenKind } from './lexer.ts';
import {
	DEFAULT_STORY_STATUS,
	DELIVERY_KINDS,
	isDeliveryKind,
	isStoryStatus,
	wrapNote,
	STORY_STATUSES,
	type ActivityNode,
	type DeliveryKind,
	type DeliveryNode,
	type StepNode,
	type StoryMapDocument,
	type StoryNode,
	type AnnotationSpans,
	type Span,
	type StoryStatus,
} from './model.ts';
import { isSaturated, report, StoryMapParseError, type Problem } from './problems.ts';

/**
 * Read a story map.
 *
 * @throws {StoryMapParseError} carrying every problem found, not just the first.
 */
export function parse(source: string): StoryMapDocument {
	const problems: Problem[] = [];
	const tokens = tokenize(source, problems);
	const document = createParser(tokens, problems, source).parseFile();

	if (problems.length > 0) throw new StoryMapParseError(problems);
	return document;
}

/** A release reference, kept unresolved until the whole file has been read. */
interface RawRef {
	readonly name: string;
	readonly line: number;
	readonly column: number;
	readonly length: number;
}

interface RawSpans {
	readonly span: Span;
	readonly titleSpan: Span;
	readonly annotations: AnnotationSpans;
	readonly openBrace: number;
	readonly notesSpan: Span | null;
}

interface RawStory {
	readonly title: string;
	readonly notes: string[];
	readonly ref: RawRef | null;
	readonly ticket: string | null;
	readonly status: StoryStatus;
	/** Unresolved until the whole file is read, exactly like a release ref. */
	persona: RawRef | null;
	want: string | null;
	soThat: string | null;
	spans: RawSpans | null;
	personaSpan: Span | null;
	wantSpan: Span | null;
	soThatSpan: Span | null;
}



interface RawStep {
	readonly title: string;
	readonly notes: string[];
	readonly ticket: string | null;
	readonly status: StoryStatus;
	readonly stories: RawStory[];
	spans: RawSpans | null;
}

interface RawActivity {
	readonly title: string;
	readonly notes: string[];
	readonly ticket: string | null;
	readonly status: StoryStatus;
	readonly personas: string[];
	readonly personaTokens: Token[];
	readonly steps: RawStep[];
	spans: RawSpans | null;
	personasSpan: Span | null;
}

interface RawDelivery {
	readonly title: string;
	readonly kind: DeliveryKind;
	readonly ticket: string | null;
	readonly notes: string[];
	readonly token: Token;
	spans: RawSpans | null;
	kindSpan: Span;
}

function createParser(tokens: readonly Token[], problems: Problem[], source: string) {
	let position = 0;

	const peek = (ahead = 0): Token => tokens[Math.min(position + ahead, tokens.length - 1)]!;

	/*
	 * Spans, built from what the lexer already records.
	 *
	 * Every token carries `offset` and `length`, so none of this needed a change
	 * to the lexer: a span is two arithmetic operations on tokens the parser is
	 * holding anyway. `line` and `column` come from the *first* token, which is
	 * where a problems entry points and where the editor scrolls to.
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

	/** A run of `note` lines, tracked so it can be rewritten as one block. */
	type NoteRun = { first: Token | null; last: Token | null };
	const noteRun = (): NoteRun => ({ first: null, last: null });
	const runSpan = (run: NoteRun): Span | null =>
		run.first === null ? null : spanFrom(run.first, run.last ?? run.first);
	const at = (kind: TokenKind, value?: string): boolean => {
		const token = peek();
		return token.kind === kind && (value === undefined || token.value === value);
	};
	const advance = (): Token => tokens[Math.min(position++, tokens.length - 1)]!;
	const atDeclaration = (): boolean => at('keyword') && peek().value !== 'storymap';

	const problemAt = (token: Token, message: string, hint?: string): void =>
		report(problems, { message, line: token.line, column: token.column, length: token.length, hint });

	/** How a token reads in a message: the word itself, or a name for a class of them. */
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

	/**
	 * Panic-mode recovery.
	 *
	 * Skip forward to something that can start a sibling declaration, or to the
	 * `}` that closes the block we are inside. Balanced braces are skipped
	 * wholesale, which is what stops a recovery from escaping the block it
	 * started in and turning one stray token into a cascade.
	 */
	function synchronize(): void {
		let depth = 0;
		while (!at('eof')) {
			if (depth === 0 && (atDeclaration() || at('rbrace'))) return;
			if (at('lbrace')) depth += 1;
			else if (at('rbrace')) depth -= 1;
			advance();
		}
	}

	/**
	 * Parse `{ ... }` if one is there, calling `item` for each declaration inside.
	 *
	 * An omitted body is legal everywhere. `step "Open a product"` with no braces
	 * is a step that has been identified and has no stories yet — a real state on
	 * a board mid-workshop, and one that has to survive an export or the column
	 * disappears.
	 */
	/**
	 * A `{ … }` body, and where its braces are.
	 *
	 * The offsets are what lets a new declaration be written *inside* an existing
	 * block — a story added to a step is spliced one step in from the step's `{`.
	 * Null means the declaration was written without a body at all.
	 */
	function parseBody(owner: string, item: () => boolean): { open: number; close: number } | null {
		if (!at('lbrace')) return null;
		const open = advance();

		while (!at('rbrace') && !at('eof') && !isSaturated(problems)) {
			// `#` is a ticket id and belongs on a story line, not where a
			// declaration is expected. Named explicitly because the mistake is an
			// easy one — a ticket id one line below the story it belongs to.
			if (at('hash')) {
				problemAt(
					peek(),
					`A ticket id is not a declaration inside \`${owner}\`.`,
					'It goes on the story line: story "Full-text search" #client-onboarding-42',
				);
				synchronize();
				continue;
			}
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

	/**
	 * `note "…"` — one string, with `\n` where the breaks are.
	 *
	 *     note "Domain comes from the registry entry,\nnot a free-text field."
	 *
	 * A note is prose and prose does not fit on one line, but the break belongs
	 * *inside* the string rather than being spread across several quoted ones.
	 * One string has one pair of quotes to keep balanced; a note continued across
	 * four lines has four pairs, and every one of them is a chance to leave a
	 * quote off and strand the rest of the file.
	 *
	 * The text is wrapped to NOTE_WRAP_COLUMNS, so the model holds the same breaks
	 * the file will be written with, and the card shows them.
	 */
	function parseNote(notes: string[], run?: NoteRun): boolean {
		if (!at('keyword', 'note')) return false;
		const keyword = advance();
		const text = expectString('note', 'A note is quoted: note "Ranking is out of scope"');
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

	/**
	 * `want "…"` / `so "…"` — one string.
	 *
	 * Collapsed to a single line whatever it contains. These two are one clause of
	 * one sentence, so a break inside one would be a break in the middle of it —
	 * the board composes the three clauses into a sentence, and a stray newline
	 * would show up in the middle of that sentence.
	 */
	function parseProse(
		word: 'want' | 'so',
		hint: string,
	): { value: string; span: Span } | undefined {
		const keyword = advance();
		const value = expectString(word, hint);
		if (value === undefined) {
			synchronize();
			return undefined;
		}
		return { value: value.value.replace(/\s+/g, ' ').trim(), span: spanFrom(keyword, value) };
	}

	/**
	 * The `@release`, `#ticket` and `~status` that may follow a card's title.
	 *
	 * Shared by stories and steps, because a step is an epic and carries the same
	 * ticket and status a story does. Only a story takes a release: a step spans
	 * every band, so the question of *when* is settled one level down.
	 *
	 * Any order is accepted — there is no reading in which one order is more
	 * correct — and each may appear once. A repeat is an error rather than a
	 * last-one-wins, because a repeat means a bad merge.
	 */
	function parseAnnotations(allowRelease: boolean, noun = 'card'): {
		ref: RawRef | null;
		ticket: string | null;
		status: StoryStatus;
		spans: AnnotationSpans;
	} {
		let ref: RawRef | null = null;
		let ticket: string | null = null;
		let status: StoryStatus | null = null;
		// Each annotation's own span, sigil included, so a change of release does
		// not disturb the ticket sitting next to it on the same line.
		const spans: { release: Span | null; ticket: Span | null; status: Span | null } = {
			release: null,
			ticket: null,
			status: null,
		};

		while (at('at') || at('hash') || at('tilde')) {
			const sigil = advance();

			if (sigil.kind === 'at') {
				if (!allowRelease) {
					problemAt(
						sigil,
						`${noun.charAt(0).toUpperCase()}${noun.slice(1)} is not in a release.`,
						`It spans every band; put the \`@release\` on its stories.`,
					);
					if (at('ident') || at('string')) advance();
					continue;
				}
				if (!at('ident') && !at('string')) {
					problemAt(
						sigil,
						`Expected a release name after \`@\`, found ${describe(peek())}.`,
						'Write @MVP, or @"Q3 2026" when the name has spaces in it.',
					);
					continue;
				}
				const name = advance();
				if (ref !== null) {
					problemAt(sigil, 'This card names two releases.', 'A story sits in one band.');
					continue;
				}
				ref = { name: name.value, line: sigil.line, column: sigil.column, length: sigil.length + name.length };
				spans.release = spanFrom(sigil, name);
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
				if (ticket !== null) {
					problemAt(sigil, 'This card names two tickets.', 'A card links to one ticket.');
					continue;
				}
				ticket = found.value;
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
				problemAt(sigil, 'This card names two statuses.', 'A card is in one state.');
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

		// Unlinked, and nothing said about it yet.
		return { ref, ticket, status: status ?? DEFAULT_STORY_STATUS, spans };
	}

	function parseStory(stories: RawStory[]): boolean {
		if (!at('keyword', 'story')) return false;
		const keyword = advance();
		const title = expectString('story', 'A story is quoted: story "Full-text search" @MVP');
		if (title === undefined) {
			synchronize();
			return true;
		}

		const { ref, ticket, status, spans } = parseAnnotations(true, 'a story');

		const notes: string[] = [];
		const run = noteRun();
		// An unlinked story reads as open: nothing has been said about it yet.
		const raw: RawStory = {
			title: title.value,
			notes,
			ref,
			ticket,
			status,
			persona: null,
			want: null,
			soThat: null,
			spans: null,
			personaSpan: null,
			wantSpan: null,
			soThatSpan: null,
		};
		stories.push(raw);

		const body = parseBody('story', () => {
			if (at('keyword', 'as')) {
				const keyword = advance();
				const name = expectString('as', 'A persona is quoted, and must be declared: as "Business analyst"');
				if (name === undefined) {
					synchronize();
					return true;
				}
				if (raw.persona !== null) {
					problemAt(keyword, 'This story names two personas.', 'A story is written for one.');
					return true;
				}
				raw.persona = {
					name: name.value,
					line: keyword.line,
					column: keyword.column,
					length: keyword.length,
				};
				raw.personaSpan = spanFrom(keyword, name);
				return true;
			}

			if (at('keyword', 'want')) {
				const value = parseProse('want', 'What the persona wants, quoted: want "to search every product at once"');
				if (value !== undefined) {
					if (raw.want !== null) return true;
					raw.want = value.value;
					raw.wantSpan = value.span;
				}
				return true;
			}

			if (at('keyword', 'so')) {
				const value = parseProse('so', 'The outcome, quoted: so "I can answer a question quickly"');
				if (value !== undefined) {
					if (raw.soThat !== null) return true;
					raw.soThat = value.value;
					raw.soThatSpan = value.span;
				}
				return true;
			}

			return parseNote(notes, run);
		});
		raw.spans = {
			span: spanFrom(keyword),
			titleSpan: tokenSpan(title),
			annotations: spans,
			openBrace: body?.open ?? -1,
			notesSpan: runSpan(run),
		};
		return true;
	}

	function parseStep(steps: RawStep[]): boolean {
		if (!at('keyword', 'step')) return false;
		const keyword = advance();
		const title = expectString('step', 'A step is quoted: step "Search the catalog"');
		if (title === undefined) {
			synchronize();
			return true;
		}

		const { ticket, status, spans } = parseAnnotations(false, 'a step');

		const notes: string[] = [];
		const stories: RawStory[] = [];
		const run = noteRun();
		const raw: RawStep = { title: title.value, notes, ticket, status, stories, spans: null };
		steps.push(raw);
		const body = parseBody('step', () => parseStory(stories) || parseNote(notes, run));
		raw.spans = {
			span: spanFrom(keyword),
			titleSpan: tokenSpan(title),
			annotations: spans,
			openBrace: body?.open ?? -1,
			notesSpan: runSpan(run),
		};
		return true;
	}

	function parseActivity(activities: RawActivity[]): boolean {
		if (!at('keyword', 'activity')) return false;
		const keyword = advance();
		const title = expectString('activity', 'An activity is quoted: activity "Discover documentation"');
		if (title === undefined) {
			synchronize();
			return true;
		}

		const { ticket, status, spans } = parseAnnotations(false, 'an activity');

		const notes: string[] = [];
		const personas: string[] = [];
		const personaTokens: Token[] = [];
		const steps: RawStep[] = [];
		const run = noteRun();
		const raw: RawActivity = {
			title: title.value,
			notes,
			ticket,
			status,
			personas,
			personaTokens,
			steps,
			spans: null,
			personasSpan: null,
		};
		activities.push(raw);

		const body = parseBody('activity', () => {
			if (at('keyword', 'persona')) {
				const keyword = advance();
				const name = expectString('persona', 'A persona is quoted: persona "Business analyst"');
				if (name === undefined) {
					synchronize();
					return true;
				}
				if (personas.includes(name.value)) {
					// A title is the key a story's `as` resolves against, so it has
					// to name one thing. A repeat means a bad merge.
					problemAt(keyword, `This activity lists the persona "${name.value}" twice.`);
					return true;
				}
				personas.push(name.value);
				personaTokens.push(keyword);
				// The run of `persona` lines, first keyword to last name: what a
				// rewrite of the list replaces.
				raw.personasSpan =
					raw.personasSpan === null
						? spanFrom(keyword, name)
						: { ...raw.personasSpan, end: name.offset + name.length };
				return true;
			}
			return parseStep(steps) || parseNote(notes, run);
		});
		raw.spans = {
			span: spanFrom(keyword),
			titleSpan: tokenSpan(title),
			annotations: spans,
			openBrace: body?.open ?? -1,
			notesSpan: runSpan(run),
		};
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
	 * `delivery "Sprint 24" sprint #CLONB-S24` — one band of the timeline.
	 *
	 * ## `release "MVP"` still parses, and is why this reads two spellings
	 *
	 * That was the only spelling until deliveries arrived, and `.storymap` files
	 * live in product repositories where nobody is watching for a grammar change.
	 * Refusing them would mean a tool upgrade silently broke files the tool itself
	 * wrote, which is the one thing a format that promises a round trip must not
	 * do.
	 *
	 * So `release "MVP"` is accepted and means `delivery "MVP" release`. It is a
	 * migration path rather than a permanent dialect: the serializer only ever
	 * writes `delivery`, so one trip through the board converts a file and the old
	 * spelling disappears from it. Delete this branch once no old file is left —
	 * nothing else depends on it.
	 */
	function parseDelivery(deliveries: RawDelivery[]): boolean {
		const legacy = at('keyword', 'release');
		if (!legacy && !at('keyword', 'delivery')) return false;
		const keyword = advance();
		const title = expectString(
			legacy ? 'release' : 'delivery',
			legacy ? 'A release is quoted: release "MVP"' : 'A delivery is quoted: delivery "Sprint 24" sprint',
		);
		if (title === undefined) {
			synchronize();
			return true;
		}

		// The old spelling names its own kind, so it takes no kind word. The new
		// one requires it: a defaulted kind would make the meaning of a bare
		// `delivery` line depend on a choice made months ago.
		let kind: DeliveryKind = 'release';
		// The old spelling has no kind word of its own, so the keyword *is* the
		// kind: changing it rewrites `release` in place, which is exactly right.
		let kindSpan: Span = tokenSpan(keyword);
		if (!legacy) {
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
		}

		// `#ticket`, on either spelling. A band takes no `~status` — where a
		// sprint is in its own lifecycle is the tracker's business — and no `@`,
		// because a delivery is a point on the timeline rather than a thing
		// placed on one.
		let ticket: string | null = null;
		let ticketSpan: Span | null = null;
		while (at('hash')) {
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
		}

		const notes: string[] = [];
		const run = noteRun();
		const raw: RawDelivery = {
			title: title.value,
			kind,
			ticket,
			notes,
			token: keyword,
			spans: null,
			kindSpan,
		};
		deliveries.push(raw);
		const body = parseBody(legacy ? 'release' : 'delivery', () => parseNote(notes, run));
		raw.spans = {
			span: spanFrom(keyword),
			titleSpan: tokenSpan(title),
			// A band takes no release and no status — see the note above.
			annotations: { release: null, ticket: ticketSpan, status: null },
			openBrace: body?.open ?? -1,
			notesSpan: runSpan(run),
		};
		return true;
	}

	function parseFile(): StoryMapDocument {
		// Skip anything before the block. A file that opens with a comment has
		// already had it discarded by the lexer, so whatever is here is junk.
		while (!at('eof') && !at('keyword', 'storymap')) {
			problemAt(
				peek(),
				`Expected \`storymap\`, found ${describe(peek())}.`,
				'A file holds one story map: storymap "Doc-Hub Onboarding" { … }',
			);
			synchronize();
			if (!at('eof') && !at('keyword', 'storymap') && !atDeclaration()) advance();
			else if (atDeclaration()) break;
		}

		if (at('eof')) {
			// Distinguish "nothing here" from "something here that is not a map".
			// They are different claims and they need different fixes.
			if (problems.length === 0) {
				report(problems, {
					message: 'The file is empty.',
					line: 1,
					column: 1,
					length: 0,
					hint: 'A story map starts with: storymap "Its title" { … }',
				});
			}
			return blank('Untitled story map', source);
		}

		let title = 'Untitled story map';
		let titleSpan: Span = tokenSpan(peek());
		let openBrace = -1;
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
		const run = noteRun();
		let notes: string[] = [];
		let deliveries: RawDelivery[] = [];
		let activities: RawActivity[] = [];

		if (at('keyword', 'storymap')) {
			advance();
			const parsed = expectString('storymap', 'The map is titled: storymap "Doc-Hub Onboarding"');
			if (parsed !== undefined) {
				title = parsed.value;
				titleSpan = tokenSpan(parsed);
			}
			notes = [];
			deliveries = [];
			activities = [];
			const body = parseBody(
				'storymap',
				() =>
					parseOnce(
						'product',
						product,
						'A product is its shortname, quoted: product "client-onboarding"',
						'The product is declared twice. A story map is about one product.',
					) ||
					parseOnce(
						'space',
						space,
						'A ticketing space is quoted: space "CLONB"',
						'The ticketing space is declared twice. Tickets are raised into one space.',
					) ||
					parseDelivery(deliveries) ||
					parseActivity(activities) ||
					parseNote(notes, run),
			);
			openBrace = body?.open ?? -1;
		}

		// A second block is rejected rather than merged: two maps in one file is
		// almost always a bad paste, and merging them would bury it.
		while (!at('eof')) {
			if (at('keyword', 'storymap')) {
				problemAt(
					peek(),
					'A second `storymap` block.',
					'One file holds one story map. Split them into two files.',
				);
			} else {
				problemAt(peek(), `Unexpected ${describe(peek())} after the story map.`);
			}
			synchronize();
			if (!at('eof') && !at('keyword', 'storymap')) advance();
		}

		return resolve(
			{
				title,
				titleSpan,
				product: product.value,
				productSpan: product.span,
				space: space.value,
				spaceSpan: space.span,
				openBrace,
				notesSpan: runSpan(run),
				source,
			},
			notes,
			deliveries,
			activities,
			problems,
		);
	}

	return { parseFile };
}

const NOWHERE: Span = { start: 0, end: 0, line: 1, column: 1 };

/**
 * A raw node's spans, or empty ones for a node whose parse never finished.
 *
 * `spans` is null only when `parseBody` threw the parser off before the closing
 * brace was reached, which means the file already has a problem and the document
 * will not be handed out. Empty spans keep the types honest without inventing a
 * position that would splice at the top of the file if one ever were.
 */
function spansOf(spans: RawSpans | null) {
	return (
		spans ?? {
			span: NOWHERE,
			titleSpan: NOWHERE,
			annotations: { release: null, ticket: null, status: null },
			openBrace: -1,
			notesSpan: null,
		}
	);
}

/** A map that was not there. Every span is empty, and so is the source. */
function blank(title: string, source: string): StoryMapDocument {
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
		activities: [],
		openBrace: -1,
		source,
	};
}

/**
 * Phase 2 — everything that only makes sense once the whole file has been read.
 */
/** Everything the file said about itself, before its cards are resolved. */
interface Header {
	readonly title: string;
	readonly titleSpan: Span;
	readonly product: string | null;
	readonly productSpan: Span | null;
	readonly space: string | null;
	readonly spaceSpan: Span | null;
	readonly openBrace: number;
	readonly notesSpan: Span | null;
	readonly source: string;
}

function resolve(
	header: Header,
	notes: readonly string[],
	rawDeliveries: readonly RawDelivery[],
	rawActivities: readonly RawActivity[],
	problems: Problem[],
): StoryMapDocument {
	/*
	 * Duplicate delivery titles are an error, and this is the decision that keeps
	 * identifiers out of the file at all: `@MVP` resolves by title, so titles
	 * have to be unique for the reference to mean one thing. The two decisions
	 * stand or fall together — if card ids are ever added to the format, this rule
	 * is the one to reconsider first.
	 *
	 * A band's `#ticket` is not such an id. It names the band in *another*
	 * system and is never resolved against, so two bands could carry the same one
	 * without any reference becoming ambiguous.
	 */
	const declared = new Map<string, RawDelivery>();
	const deliveries: DeliveryNode[] = [];
	for (const delivery of rawDeliveries) {
		const existing = declared.get(delivery.title);
		if (existing) {
			report(problems, {
				message: `The delivery "${delivery.title}" is declared twice.`,
				line: delivery.token.line,
				column: delivery.token.column,
				length: delivery.token.length,
				hint: `Already declared on line ${existing.token.line}. A story refers to a delivery by its title, so the titles have to differ.`,
			});
			continue;
		}
		declared.set(delivery.title, delivery);
		deliveries.push({
			title: delivery.title,
			kind: delivery.kind,
			ticket: delivery.ticket,
			notes: [...delivery.notes],
			...spansOf(delivery.spans),
			kindSpan: delivery.kindSpan,
		});
	}

	const activities: ActivityNode[] = rawActivities.map((activity): ActivityNode => ({
		title: activity.title,
		notes: [...activity.notes],
		ticket: activity.ticket,
		status: activity.status,
		personas: [...activity.personas],
		...spansOf(activity.spans),
		personasSpan: activity.personasSpan,
		steps: activity.steps.map((step): StepNode => ({
			title: step.title,
			notes: [...step.notes],
			ticket: step.ticket,
			status: step.status,
			...spansOf(step.spans),
			stories: step.stories.map((story): StoryNode => ({
				title: story.title,
				notes: [...story.notes],
				release: resolveRef(story.ref),
				persona: resolvePersona(story.persona, activity),
				want: story.want,
				soThat: story.soThat,
				ticket: story.ticket,
				status: story.status,
				...spansOf(story.spans),
				personaSpan: story.personaSpan,
				wantSpan: story.wantSpan,
				soThatSpan: story.soThatSpan,
			})),
		})),
	}));

	return { ...header, notes: [...notes], deliveries, activities };

	/*
	 * An `@` naming a release that was never declared is a hard error, not a
	 * silent demotion to unassigned. The author plainly meant to commit the
	 * story to something; dropping that quietly would lose the intent and lose
	 * it invisibly, which is the worst combination.
	 */
	function resolveRef(ref: RawRef | null): string | null {
		if (ref === null) return null;
		if (declared.has(ref.name)) return ref.name;

		report(problems, {
			message: `No delivery is called "${ref.name}".`,
			line: ref.line,
			column: ref.column,
			length: ref.length,
			hint: suggest(ref.name),
		});
		return null;
	}

	/**
	 * A story may name a persona its own activity lists, and no other.
	 *
	 * Scoped to the activity because that is where the cast is declared. The
	 * alternative — resolving against every persona anywhere on the board — would
	 * let a story quietly belong to an activity that never mentions its reader,
	 * which is exactly the disagreement the listing exists to surface.
	 */
	function resolvePersona(ref: RawRef | null, activity: RawActivity): string | null {
		if (ref === null) return null;
		if (activity.personas.includes(ref.name)) return ref.name;

		const near = activity.personas.find(
			(candidate) => candidate.toLowerCase() === ref.name.toLowerCase(),
		);
		report(problems, {
			message: `The activity "${activity.title}" does not list a persona called "${ref.name}".`,
			line: ref.line,
			column: ref.column,
			length: ref.length,
			hint:
				activity.personas.length === 0
					? `This activity lists no personas. Add one to it: persona "${ref.name}"`
					: near
						? `Did you mean "${near}"? Persona names are case-sensitive.`
						: `It lists: ${activity.personas.map((n) => `"${n}"`).join(', ')}.`,
		});
		return null;
	}

	function suggest(name: string): string {
		const names = [...declared.keys()];
		if (names.length === 0) return 'No deliveries are declared. Add: delivery "Sprint 24" sprint';
		const near = names.find((candidate) => candidate.toLowerCase() === name.toLowerCase());
		if (near) return `Did you mean @${quoteIfNeeded(near)}? Release names are case-sensitive.`;
		return `Declared deliveries: ${names.map((n) => `"${n}"`).join(', ')}.`;
	}
}

/** Bare when it can be, quoted when it must be. Shared with the serializer. */
export function quoteIfNeeded(name: string): string {
	return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(name) && !STORYMAP_KEYWORDS.has(name)
		? name
		: `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
