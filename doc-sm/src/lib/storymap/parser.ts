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
import type {
	ActivityNode,
	ReleaseNode,
	StepNode,
	StoryMapDocument,
	StoryNode,
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
}

interface RawStep {
	readonly title: string;
	readonly notes: string[];
	readonly stories: RawStory[];
}

interface RawActivity {
	readonly title: string;
	readonly notes: string[];
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
			// `#id` is reserved, not supported. Rejecting it explicitly costs two
			// lines now and makes a future card-id feature a parser-only change,
			// with no break in the file format.
			if (at('hash')) {
				problemAt(
					peek(),
					'Card ids are not supported.',
					'Identity in a story map file is position and title. Remove the `#`.',
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

	function parseNote(notes: string[]): boolean {
		if (!at('keyword', 'note')) return false;
		advance();
		const text = expectString('note', 'A note is quoted: note "Ranking is out of scope"');
		if (text !== undefined) notes.push(text);
		return true;
	}

	function parseStory(stories: RawStory[]): boolean {
		if (!at('keyword', 'story')) return false;
		advance();
		const title = expectString('story', 'A story is quoted: story "Full-text search" @MVP');
		if (title === undefined) {
			synchronize();
			return true;
		}

		// A release reference binds to the story before it, and `@` can follow
		// nothing else — which is what lets a long title wrap onto its own line.
		let ref: RawRef | null = null;
		if (at('at')) {
			const sigil = advance();
			if (at('ident') || at('string')) {
				const name = advance();
				ref = { name: name.value, line: sigil.line, column: sigil.column, length: sigil.length + name.length };
			} else {
				problemAt(
					sigil,
					`Expected a release name after \`@\`, found ${describe(peek())}.`,
					'Write @MVP, or @"Q3 2026" when the name has spaces in it.',
				);
			}
		}

		const notes: string[] = [];
		stories.push({ title, notes, ref });
		parseBody('story', () => parseNote(notes));
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
		const steps: RawStep[] = [];
		activities.push({ title, notes, steps });
		parseBody('activity', () => parseStep(steps) || parseNote(notes));
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
			return { title: 'Untitled story map', notes: [], releases: [], activities: [] };
		}

		let title = 'Untitled story map';
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
				() => parseRelease(releases) || parseActivity(activities) || parseNote(notes),
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

		return resolve(title, notes, releases, activities, problems);
	}

	return { parseFile };
}

/**
 * Phase 2 — everything that only makes sense once the whole file has been read.
 */
function resolve(
	title: string,
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
		steps: activity.steps.map((step): StepNode => ({
			title: step.title,
			notes: [...step.notes],
			stories: step.stories.map((story): StoryNode => ({
				title: story.title,
				notes: [...story.notes],
				release: resolveRef(story.ref),
			})),
		})),
	}));

	return { title, notes: [...notes], releases, activities };

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
