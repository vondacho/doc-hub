/**
 * Render a story map back to `.storymap` text.
 *
 * Deterministic and total. There is no timestamp anywhere in the output, on
 * purpose: a timestamp would make every export differ from the last, which
 * destroys `git diff` for anyone who commits the file next to the code it
 * describes — and diffing is most of the reason to have a text format at all.
 *
 * ## What survives a round trip
 *
 * | Preserved                                   | Not preserved                        |
 * | ------------------------------------------- | ------------------------------------ |
 * | Map title                                   | Comments — every one of them         |
 * | The product shortname                       | Blank lines                          |
 * | Release set, and band order                 | Indentation width and style          |
 * | Activity / step / story structure and order | `@"Bare"` vs `@Bare` (normalised)    |
 * | Priority order within a cell                | `{ }` on an empty card (omitted)     |
 * | Release assignment, and unassignment        | `release` interleaved with activities |
 * | Ticket ids, and being unlinked              | `~open`, the default, which is        |
 * | Story statuses                              | written back out as nothing           |
 * | Notes, and their order                      | (both are hoisted to the top)        |
 *
 * The comment loss is the one that will surprise someone, so it is stated in the
 * README and in the banner this file emits, rather than left to be discovered
 * the first time an annotated file goes through the board.
 *
 * A partial preservation — keeping the leading comment block and re-emitting it
 * — was considered and rejected: it saves the one comment people write while
 * still silently dropping every inline one, which is a worse promise than
 * dropping all of them. Revisit if these files start living in git next to the
 * code they describe and people start annotating them. The fix at that point is
 * to attach trivia to tokens in the lexer and thread it through here, which is a
 * lexer and serializer change and not a grammar change.
 *
 * ## The contract
 *
 *     serialize(parse(serialize(d))) === serialize(d)
 *
 * The output is a fixed point. That is a stronger and more useful promise than
 * "text round-trips", and it is what makes "export, hand-edit, re-import" safe.
 */

import { DEFAULT_STORY_STATUS, wrapNote, type StoryMapDocument } from './model.ts';
import { quoteIfNeeded } from './parser.ts';

const INDENT = '  ';

/**
 * Write one note, broken across as many lines as its text needs.
 *
 * Continuation lines are indented to sit under the opening quote, so a note
 * reads as one block rather than as several notes. The parser reads them back
 * as one — see parseNote.
 *
 * wrapNote is applied here as well as in the parser. It is idempotent, so a
 * note that came from a file is unchanged, and a note that arrived some other
 * way still obeys the measure.
 */
function emitProse(out: string[], indent: string, keyword: string, text: string): void {
	const [first, ...rest] = wrapNote(text).split('\n');
	out.push(`${indent}${keyword} ${quote(first ?? '')}`);
	// Continuation lines sit under the opening quote, whatever the keyword.
	const pad = ' '.repeat(keyword.length + 1);
	for (const line of rest) out.push(`${indent}${pad}${quote(line)}`);
}

function emitNote(out: string[], indent: string, text: string): void {
	const [first, ...rest] = wrapNote(text).split('\n');
	out.push(`${indent}note ${quote(first ?? '')}`);
	// Five spaces: the width of `note ` , so the strings line up.
	for (const line of rest) out.push(`${indent}     ${quote(line)}`);
}

const BANNER = [
	'// Story map exported by doc-sm.',
	'// Comments and blank lines in an imported file are not preserved: the board',
	'// is the source, this file is a render of it.',
	'',
].join('\n');

export function serialize(document: StoryMapDocument): string {
	const out: string[] = [BANNER];

	out.push(`storymap ${quote(document.title)} {`);

	// The product first, above everything else, because it is what the map is
	// *about* — the same order the board puts it in, above the title.
	if (document.product !== null) out.push(`${INDENT}product ${quote(document.product)}`);
	// Only written when stated. An unstated space follows the product, and
	// writing the same word twice would make the common case noisy.
	if (document.space !== null) out.push(`${INDENT}space ${quote(document.space)}`);

	for (const note of document.notes) emitNote(out, INDENT, note);

	const headed = document.product !== null || document.space !== null || document.notes.length > 0;

	// Releases are hoisted above the activities regardless of where they were
	// written. Band order is declaration order, so this is also the one place
	// the vertical axis of the board is spelled out in the file.
	if (document.releases.length > 0) {
		if (headed) out.push('');
		for (const release of document.releases) {
			if (release.notes.length === 0) {
				out.push(`${INDENT}release ${quote(release.title)}`);
				continue;
			}
			out.push(`${INDENT}release ${quote(release.title)} {`);
			for (const note of release.notes) emitNote(out, INDENT.repeat(2), note);
			out.push(`${INDENT}}`);
		}
	}

	for (const activity of document.activities) {
		out.push('');
		const hasBody =
			activity.notes.length > 0 || activity.personas.length > 0 || activity.steps.length > 0;
		if (!hasBody) {
			out.push(`${INDENT}activity ${quote(activity.title)}`);
			continue;
		}
		out.push(`${INDENT}activity ${quote(activity.title)} {`);
		// The cast first: who this is for, before what they do.
		for (const persona of activity.personas) out.push(`${INDENT.repeat(2)}persona ${quote(persona)}`);
		for (const note of activity.notes) emitNote(out, INDENT.repeat(2), note);

		for (const step of activity.steps) {
			const stepHasBody = step.notes.length > 0 || step.stories.length > 0;
			if (!stepHasBody) {
				out.push(`${INDENT.repeat(2)}step ${quote(step.title)}`);
				continue;
			}
			out.push(`${INDENT.repeat(2)}step ${quote(step.title)} {`);
			for (const note of step.notes) emitNote(out, INDENT.repeat(3), note);

			for (const story of step.stories) {
				// An unassigned story simply has no `@` — that absence is the
				// below-the-line backlog, and there is no sentinel to write.
				const ref = story.release === null ? '' : ` @${quoteIfNeeded(story.release)}`;
				// An unlinked story writes no `#`, exactly as an unassigned one writes
				// no `@`: absence is the encoding, in both cases.
				const ticket = story.ticket === null ? '' : ` #${quoteIfNeeded(story.ticket)}`;
				// The default status is left unwritten too, so a board nobody has
				// touched produces a file with no status noise in it.
				const status = story.status === DEFAULT_STORY_STATUS ? '' : ` ~${story.status}`;
				const head = `${INDENT.repeat(3)}story ${quote(story.title)}${ref}${ticket}${status}`;
				const hasNeed = story.persona !== null || story.want !== null || story.soThat !== null;
				if (story.notes.length === 0 && !hasNeed) {
					out.push(head);
					continue;
				}
				out.push(`${head} {`);
				// The need first: it is why the card exists. A free note is a footnote
				// to it, not a replacement for it.
				if (story.persona !== null) out.push(`${INDENT.repeat(4)}as ${quote(story.persona)}`);
				if (story.want !== null) emitProse(out, INDENT.repeat(4), 'want', story.want);
				if (story.soThat !== null) emitProse(out, INDENT.repeat(4), 'so', story.soThat);
				for (const note of story.notes) emitNote(out, INDENT.repeat(4), note);
				out.push(`${INDENT.repeat(3)}}`);
			}
			out.push(`${INDENT.repeat(2)}}`);
		}
		out.push(`${INDENT}}`);
	}

	out.push('}');
	return `${out.join('\n')}\n`;
}

/**
 * Only the four escapes the lexer understands are ever emitted. A tab or a
 * newline inside a title is legal but would break the one-line-per-card layout,
 * so both are escaped rather than written literally.
 */
function quote(text: string): string {
	const escaped = text
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"')
		.replace(/\n/g, '\\n')
		.replace(/\t/g, '\\t')
		// A lone \r would survive into a file that then lexes differently.
		.replace(/\r/g, '');
	return `"${escaped}"`;
}
