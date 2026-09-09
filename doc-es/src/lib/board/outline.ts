/**
 * The wall as prose: one Markdown document.
 *
 * The picture is for a deck; this is for a wiki page, a pull request, or the
 * body of a ticket — the places where a `.svg` is an attachment nobody opens
 * and an image is not searchable. It is also the only export that a screen
 * reader, a `grep` or a diff can do anything with, which is why it exists
 * alongside the two pictures rather than instead of one of them.
 *
 * ## It follows the document, not the eye
 *
 * Lanes first, columns within them — the order the `.eventstorm` file writes,
 * and the order the source pane shows. The wall's own reading order is the
 * other way round: time runs across, so column 4 in every lane is one moment,
 * and the arrangement's whole claim is that those notes belong together.
 *
 * That claim is a *spatial* one, and prose cannot make it. A document that
 * interleaved the lanes to preserve it would read as a list of unrelated
 * sentences with the lane repeated on every line, and the reader would have to
 * rebuild the grid in their head to get anything back. So the outline keeps
 * each lane whole and writes the column on every note, which is the honest
 * trade: the grouping is legible, the moment is recoverable, and nobody is
 * asked to pretend a list is a grid.
 *
 * ## Nothing is dated
 *
 * There is no "exported on" line, and it is not an oversight. An outline is the
 * export most likely to be committed beside the code it describes, and a
 * timestamp would make every regeneration a diff — the same wall, a different
 * file, for no reason a reviewer can act on. The `.eventstorm` file carries no
 * date either, for the same reason.
 *
 * ## Nothing is lost
 *
 * Every note's title, every one of its note lines and every tag, plus the lane
 * notes and the board's own. This is the export somebody reaches for when the
 * question is "what did we actually say", so a summary would be the wrong
 * document — the summary is the picture.
 */

import { CARD_KINDS, cardLabel, levelLabel, type CardKind, type Level } from '../eventstorm/model.ts';
import { cardsAt, lastColumn, type BoardState, type Id } from './state.ts';

export interface OutlineOptions {
	/**
	 * The cards to write, or `null` for all of them. The board's `matching` set.
	 *
	 * As with the picture, a filtered-out note is left out rather than marked:
	 * a document is read for what it says, and a list of struck-through lines is
	 * a worse artefact than a shorter list with a caption saying it is one.
	 */
	readonly only: ReadonlySet<Id> | null;
	/**
	 * The level this outline's own notes reach, for the caption. As the picture's
	 * — see `reaches` in the export catalogue.
	 */
	readonly level: Level;
}

export function boardMarkdown(board: BoardState, options: OutlineOptions): string {
	const shown = (id: Id) => options.only === null || options.only.has(id);
	const out: string[] = [`# ${escape(board.title)}`, ''];

	const facts: string[] = [];
	if (board.product !== null) facts.push(`**Product:** ${escape(board.product)}`);
	facts.push(`**Level:** ${levelLabel[options.level]}`);
	if (options.only !== null) {
		facts.push('**Filtered:** only the notes the board was showing when this was exported');
	}
	out.push(facts.join('  \n'), '');

	for (const note of board.notes) out.push(escape(note), '');

	const counts = tally(board, shown);
	if (counts.length > 0) {
		out.push(counts.map(({ kind, count }) => `${cardLabel[kind]} ${count}`).join(' · '), '');
	}

	const columns = Math.max(1, lastColumn(board));

	for (const laneId of board.laneOrder) {
		const lane = board.lanes[laneId];
		if (!lane) continue;

		out.push(`## ${escape(lane.title)}`, '');
		for (const note of lane.notes) out.push(escape(note), '');

		let wrote = false;
		for (let column = 1; column <= columns; column += 1) {
			for (const id of cardsAt(board, laneId, column).filter(shown)) {
				const card = board.cards[id];
				if (!card) continue;
				wrote = true;

				const tags = card.tags.map((tag) => `\`+${escape(tag)}\``).join(' ');
				out.push(
					`- **col ${column}** · ${cardLabel[card.kind]} — ${escape(card.title)}${tags === '' ? '' : ` ${tags}`}`,
				);
				/*
				 * Two spaces of indent on *every* line, and that includes the
				 * lines inside one note.
				 *
				 * The indent is what keeps a paragraph inside its list item — a
				 * note written at column zero ends the list, and every item under
				 * it reflows into one run-on paragraph in most renderers. And a
				 * note is not one line: the source pane hard-wraps them (see
				 * `wrapNote` in the document model), so a single entry in
				 * `card.notes` may carry its own newlines. Indenting the entry
				 * rather than each of its lines indents the first one only, which
				 * is exactly the case that breaks the list and exactly the case
				 * nobody writes a test for.
				 */
				for (const note of card.notes) {
					for (const line of note.split('\n')) out.push(`  ${escape(line)}`);
				}
			}
		}

		// A lane with nothing on it is a statement — somebody put it up and has
		// not filled it in, or the filter emptied it — and an empty heading
		// followed by the next heading reads as a document that lost something.
		if (!wrote) out.push('_Nothing on this lane._');
		out.push('');
	}

	return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

/** The kinds in use and how many of each, in notation order. */
function tally(board: BoardState, shown: (id: Id) => boolean): readonly { kind: CardKind; count: number }[] {
	const counts = new Map<CardKind, number>();
	for (const [id, card] of Object.entries(board.cards)) {
		if (!shown(id)) continue;
		counts.set(card.kind, (counts.get(card.kind) ?? 0) + 1);
	}
	return CARD_KINDS.filter((kind) => counts.has(kind)).map((kind) => ({ kind, count: counts.get(kind) ?? 0 }));
}

/**
 * Escape the characters that would make free text into markup.
 *
 * Only the ones that bite *inline*, and only where a title realistically
 * contains them: a `*` or a `_` in the middle of a sentence turns the rest of
 * the line italic, a `` ` `` opens a code span that swallows the next one, a
 * `[` starts a link, and a `<` is raw HTML in every renderer that allows it. A
 * general-purpose escaper would also backslash every `#`, `-` and `.`, which
 * turns readable prose into something nobody wants to read in the raw.
 */
function escape(value: string): string {
	return value.replace(/([\\`*_[\]<>])/g, '\\$1');
}
