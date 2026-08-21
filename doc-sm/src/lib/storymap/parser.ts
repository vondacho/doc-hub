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
	readonly ticket: string | null;
	readonly status: StoryStatus;
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
	function parseNote(notes: string[]): boolean {
		if (!at('keyword', 'note')) return false;
		advance();
		const text = expectString('note', 'A note is quoted: note "Ranking is out of scope"');
		if (text === undefined) {
			synchronize();
			return true;
		}
		notes.push(wrapNote(text));
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
	function parseProse(word: 'want' | 'so', hint: string): string | undefined {
		advance();
		const value = expectString(word, hint);
		if (value === undefined) {
			synchronize();
			return undefined;
		}
		return value.replace(/\s+/g, ' ').trim();
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
	function parseAnnotations(allowRelease: boolean): {
		ref: RawRef | null;
		ticket: string | null;
		status: StoryStatus;
	} {
		let ref: RawRef | null = null;
		let ticket: string | null = null;
		let status: StoryStatus | null = null;

		while (at('at') || at('hash') || at('tilde')) {
			const sigil = advance();

			if (sigil.kind === 'at') {
				if (!allowRelease) {
					problemAt(
						sigil,
						'A step is not in a release.',
						'A step spans every band; put the `@release` on its stories.',
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
					problemAt(sigil, 'This card names two tickets.', 'A card links to one ticket.');
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
		}

		// Unlinked, and nothing said about it yet.
		return { ref, ticket, status: status ?? DEFAULT_STORY_STATUS };
	}

	function parseStory(stories: RawStory[]): boolean {
		if (!at('keyword', 'story')) return false;
		advance();
		const title = expectString('story', 'A story is quoted: story "Full-text search" @MVP');
		if (title === undefined) {
			synchronize();
			return true;
		}

		const { ref, ticket, status } = parseAnnotations(true);

		const notes: string[] = [];
		// An unlinked story reads as open: nothing has been said about it yet.
		const raw: RawStory = {
			title,
			notes,
			ref,
			ticket,
			status,
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

		const { ticket, status } = parseAnnotations(false);

		const notes: string[] = [];
		const stories: RawStory[] = [];
		steps.push({ title, notes, ticket, status, stories });
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
			ticket: step.ticket,
			status: step.status,
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
