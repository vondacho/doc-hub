/**
 * The `.storymap` parser — recursive descent over the token array.
 *
 * Two phases, and the split is what makes the error messages good.
 *
 *   1. parse    builds the tree, carrying each `@Release` reference as a raw
 *               name plus the position it was written at.
 *   2. resolve  validates what only makes sense once the whole file is read:
 *               duplicate release titles, references to releases that were
 *               never declared, a second `storymap` block, no block at all.
 *
 * Phase 2 is why a `release` declaration may appear *after* the activity that
 * references it. A hand-editor adding a release at the bottom of the file is not
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
	isStoryStatus,
	wrapNote,
	STORY_STATUSES,
	type ActivityNode,
	type ReleaseNode,
	type StepNode,
	type StoryMapDocument,
	type StoryNode,
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
	const document = createParser(tokens, problems).parseFile();

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
}



interface RawStep {
	readonly title: string;
	readonly notes: string[];
	readonly stories: RawStory[];
}

interface RawActivity {
	readonly title: string;
	readonly notes: string[];
	readonly personas: string[];
	readonly personaTokens: Token[];
	readonly steps: RawStep[];
}

interface RawRelease {
	readonly title: string;
	readonly notes: string[];
	readonly token: Token;
}

function createParser(tokens: readonly Token[], problems: Problem[]) {
	let position = 0;

	const peek = (ahead = 0): Token => tokens[Math.min(position + ahead, tokens.length - 1)]!;
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

	function expectString(after: string, hint: string): string | undefined {
		if (at('string')) return advance().value;
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
	function parseBody(owner: string, item: () => boolean): void {
		if (!at('lbrace')) return;
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
			advance();
			return;
		}
		problemAt(
			peek(),
			`Expected \`}\` to close \`${owner}\`, found ${describe(peek())}.`,
			`The \`{\` on line ${open.line} is never closed.`,
		);
	}

	/**
	 * `note "…"`, optionally continued on the lines below.
	 *
	 * A note is prose, and prose does not fit on one line. Rather than making
	 * people write `\n` escapes into a single very long string, a bare quoted
	 * string following a note is a continuation, and the two are joined with a
	 * line break:
	 *
	 *     note "Domain comes from the registry entry,"
	 *          "not a free-text field."
	 *
	 * Unambiguous with one token of lookahead: every item inside a body starts
	 * with a keyword or closes it, so a bare string in that position can only be
	 * a continuation of the note before it. (`\n` inside a string still works,
	 * for anything that produces these files by machine.)
	 *
	 * The joined text is wrapped to NOTE_WRAP_COLUMNS, so the model always holds
	 * the same breaks the file will be written with.
	 */
	function parseNote(notes: string[]): boolean {
		if (!at('keyword', 'note')) return false;
		advance();
		const first = expectString('note', 'A note is quoted: note "Ranking is out of scope"');
		if (first === undefined) {
			synchronize();
			return true;
		}

		const lines = [first];
		while (at('string')) lines.push(advance().value);
		notes.push(wrapNote(lines.join('\n')));
		return true;
	}

	/**
	 * `want "…"` / `so "…"`, continued on the lines below.
	 *
	 * Continuations join with a **space**, not a line break — the opposite of a
	 * note, and deliberately. A note may genuinely be several lines; these two are
	 * one clause of one sentence, and the breaks in the file are only there
	 * because the measure put them there. Storing them would put a hard break in
	 * the middle of the sentence the board composes.
	 *
	 * So the model holds the clause as written and the serializer re-wraps it.
	 * Unwrapping and re-wrapping round-trips exactly, because wrapping collapses
	 * runs of whitespace either way.
	 */
	function parseProse(word: 'want' | 'so', hint: string): string | undefined {
		advance();
		const first = expectString(word, hint);
		if (first === undefined) {
			synchronize();
			return undefined;
		}
		const parts = [first];
		while (at('string')) parts.push(advance().value);
		return parts.join(' ').replace(/\s+/g, ' ').trim();
	}

	function parseStory(stories: RawStory[]): boolean {
		if (!at('keyword', 'story')) return false;
		advance();
		const title = expectString('story', 'A story is quoted: story "Full-text search" @MVP');
		if (title === undefined) {
			synchronize();
			return true;
		}

		/*
		 * Three optional annotations follow the title, and any order is accepted:
		 *
		 *   @Release   the band it sits in
		 *   #ticket    the ticket it is linked to, as the ticketing system spells it
		 *   ~status    where that ticket is in the workflow
		 *
		 * Order is not enforced because there is no reading in which one order is
		 * more correct, and rejecting `#42 @MVP` would be pedantry. Each may appear
		 * at most once; a repeat is an error rather than a last-one-wins, because a
		 * repeat means a bad merge.
		 */
		let ref: RawRef | null = null;
		let ticket: string | null = null;
		let status: StoryStatus | null = null;

		while (at('at') || at('hash') || at('tilde')) {
			const sigil = advance();

			if (sigil.kind === 'at') {
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
					problemAt(sigil, 'This story names two releases.', 'A story sits in one band.');
					continue;
				}
				ref = { name: name.value, line: sigil.line, column: sigil.column, length: sigil.length + name.length };
				continue;
			}

			if (sigil.kind === 'hash') {
				if (!at('ident') && !at('string')) {
					problemAt(
						sigil,
						`Expected a ticket id after \`#\`, found ${describe(peek())}.`,
						'Write the id the ticketing system issued: #client-onboarding-42',
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

			// tilde
			if (!at('ident')) {
				problemAt(
					sigil,
					`Expected a status after \`~\`, found ${describe(peek())}.`,
					`One of: ${STORY_STATUSES.map((s) => `~${s}`).join(', ')}`,
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
					`One of: ${STORY_STATUSES.map((s) => `~${s}`).join(', ')}`,
				);
				continue;
			}
			status = word.value;
		}

		const notes: string[] = [];
		// An unlinked story reads as open: nothing has been said about it yet.
		const raw: RawStory = {
			title,
			notes,
			ref,
			ticket,
			status: status ?? DEFAULT_STORY_STATUS,
			persona: null,
			want: null,
			soThat: null,
		};
		stories.push(raw);

		parseBody('story', () => {
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
					name,
					line: keyword.line,
					column: keyword.column,
					length: keyword.length,
				};
				return true;
			}

			if (at('keyword', 'want')) {
				const value = parseProse('want', 'What the persona wants, quoted: want "to search every product at once"');
				if (value !== undefined) {
					if (raw.want !== null) return true;
					raw.want = value;
				}
				return true;
			}

			if (at('keyword', 'so')) {
				const value = parseProse('so', 'The outcome, quoted: so "I can answer a question quickly"');
				if (value !== undefined) {
					if (raw.soThat !== null) return true;
					raw.soThat = value;
				}
				return true;
			}

			return parseNote(notes);
		});
		return true;
	}

	function parseStep(steps: RawStep[]): boolean {
		if (!at('keyword', 'step')) return false;
		advance();
		const title = expectString('step', 'A step is quoted: step "Search the catalog"');
		if (title === undefined) {
			synchronize();
			return true;
		}

		const notes: string[] = [];
		const stories: RawStory[] = [];
		steps.push({ title, notes, stories });
		parseBody('step', () => parseStory(stories) || parseNote(notes));
		return true;
	}

	function parseActivity(activities: RawActivity[]): boolean {
		if (!at('keyword', 'activity')) return false;
		advance();
		const title = expectString('activity', 'An activity is quoted: activity "Discover documentation"');
		if (title === undefined) {
			synchronize();
			return true;
		}

		const notes: string[] = [];
		const personas: string[] = [];
		const personaTokens: Token[] = [];
		const steps: RawStep[] = [];
		activities.push({ title, notes, personas, personaTokens, steps });

		parseBody('activity', () => {
			if (at('keyword', 'persona')) {
				const keyword = advance();
				const name = expectString('persona', 'A persona is quoted: persona "Business analyst"');
				if (name === undefined) {
					synchronize();
					return true;
				}
				if (personas.includes(name)) {
					// A title is the key a story's `as` resolves against, so it has
					// to name one thing. A repeat means a bad merge.
					problemAt(keyword, `This activity lists the persona "${name}" twice.`);
					return true;
				}
				personas.push(name);
				personaTokens.push(keyword);
				return true;
			}
			return parseStep(steps) || parseNote(notes);
		});
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

	function parseRelease(releases: RawRelease[]): boolean {
		if (!at('keyword', 'release')) return false;
		const keyword = advance();
		const title = expectString('release', 'A release is quoted: release "MVP"');
		if (title === undefined) {
			synchronize();
			return true;
		}

		const notes: string[] = [];
		releases.push({ title, notes, token: keyword });
		parseBody('release', () => parseNote(notes));
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
			return { title: 'Untitled story map', product: null, space: null, notes: [], releases: [], activities: [] };
		}

		let title = 'Untitled story map';
		const product: { value: string | null; token: Token | null } = { value: null, token: null };
		const space: { value: string | null; token: Token | null } = { value: null, token: null };
		let notes: string[] = [];
		let releases: RawRelease[] = [];
		let activities: RawActivity[] = [];

		if (at('keyword', 'storymap')) {
			advance();
			const parsed = expectString('storymap', 'The map is titled: storymap "Doc-Hub Onboarding"');
			if (parsed !== undefined) title = parsed;
			notes = [];
			releases = [];
			activities = [];
			parseBody(
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
					parseRelease(releases) ||
					parseActivity(activities) ||
					parseNote(notes),
			);
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

		return resolve(title, product.value, space.value, notes, releases, activities, problems);
	}

	return { parseFile };
}

/**
 * Phase 2 — everything that only makes sense once the whole file has been read.
 */
function resolve(
	title: string,
	product: string | null,
	space: string | null,
	notes: readonly string[],
	rawReleases: readonly RawRelease[],
	rawActivities: readonly RawActivity[],
	problems: Problem[],
): StoryMapDocument {
	/*
	 * Duplicate release titles are an error, and this is the decision that keeps
	 * identifiers out of the file at all: `@MVP` resolves by title, so titles
	 * have to be unique for the reference to mean one thing. The two decisions
	 * stand or fall together — if ids are ever added to the format, this rule is
	 * the one to reconsider first.
	 */
	const declared = new Map<string, RawRelease>();
	const releases: ReleaseNode[] = [];
	for (const release of rawReleases) {
		const existing = declared.get(release.title);
		if (existing) {
			report(problems, {
				message: `The release "${release.title}" is declared twice.`,
				line: release.token.line,
				column: release.token.column,
				length: release.token.length,
				hint: `Already declared on line ${existing.token.line}. A story refers to a release by its title, so the titles have to differ.`,
			});
			continue;
		}
		declared.set(release.title, release);
		releases.push({ title: release.title, notes: [...release.notes] });
	}

	const activities: ActivityNode[] = rawActivities.map((activity): ActivityNode => ({
		title: activity.title,
		notes: [...activity.notes],
		personas: [...activity.personas],
		steps: activity.steps.map((step): StepNode => ({
			title: step.title,
			notes: [...step.notes],
			stories: step.stories.map((story): StoryNode => ({
				title: story.title,
				notes: [...story.notes],
				release: resolveRef(story.ref),
				persona: resolvePersona(story.persona, activity),
				want: story.want,
				soThat: story.soThat,
				ticket: story.ticket,
				status: story.status,
			})),
		})),
	}));

	return { title, product, space, notes: [...notes], releases, activities };

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
			message: `No release is called "${ref.name}".`,
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
		if (names.length === 0) return 'No releases are declared. Add: release "MVP"';
		const near = names.find((candidate) => candidate.toLowerCase() === name.toLowerCase());
		if (near) return `Did you mean @${quoteIfNeeded(near)}? Release names are case-sensitive.`;
		return `Declared releases: ${names.map((n) => `"${n}"`).join(', ')}.`;
	}
}

/** Bare when it can be, quoted when it must be. Shared with the serializer. */
export function quoteIfNeeded(name: string): string {
	return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(name) && !STORYMAP_KEYWORDS.has(name)
		? name
		: `"${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
