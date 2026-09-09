/**
 * Where a wall can go, and what it becomes on the way.
 *
 * One place that knows the four destinations, so nothing else has to. The
 * dialog reads this list to draw its rows; the board hands it a request and
 * gets files back. Neither of them knows what an SVG is, and neither of them
 * composes a filename.
 *
 * ## Why a list, and not four buttons
 *
 * A toolbar with four export buttons on it is a toolbar where the common
 * gesture — take the file — has become a thing you have to aim at. It also has
 * no room to say what any of them *are*: "SVG" and "Markdown" are formats, and
 * the question somebody actually has is "which of these do I put in the deck".
 * A row can carry a sentence; a 36px button cannot.
 *
 * And several destinations are frequently wanted at once. The picture goes in
 * the deck, the outline goes in the ticket, and the `.eventstorm` is the copy
 * that survives — that is one gesture with three outcomes, not three gestures.
 *
 * ## What "produce" promises
 *
 * A filename and a blob, and no side effect. Nothing here touches the DOM
 * except through `boardSvg`'s palette read and the canvas the PNG is rastered
 * on, and nothing here downloads anything: the caller decides what to do with
 * the file, which is what makes a run of several of them one loop rather than
 * four special cases.
 *
 * It is `async` for one of the four. That is worth the uniformity — a catalogue
 * where one entry has a different call shape is a catalogue every caller has to
 * branch on.
 */

import type { IconName } from './icons.ts';
import { LEVELS, levelOfKind, type Level } from '../eventstorm/model.ts';
import type { BoardState, Id } from './state.ts';
import { boardSvg, svgToPng } from './picture.ts';
import { boardMarkdown } from './outline.ts';
import { DOCTRINE_STEM, doctrineDocument, NOTATION_STEM, notationDocument } from './instructions.ts';
import { filenameFor } from '../files.ts';

export type DestinationId = 'source' | 'svg' | 'png' | 'outline' | 'notation' | 'doctrine';

/**
 * Which half of the dialog a destination belongs in.
 *
 * `wall` is a rendering of the storm on screen; `reference` is a document about
 * the practice, identical whatever is open. They are grouped rather than mixed
 * because ticking one of each produces two files with almost nothing in common,
 * and a flat list of six invites somebody to read "Outline" and "Doctrine" as
 * two flavours of the same thing.
 */
export type Group = 'wall' | 'reference';

export interface Destination {
	readonly id: DestinationId;
	/** The row's heading. What the file is, not what the format is called. */
	readonly label: string;
	readonly extension: string;
	readonly icon: IconName;
	/** One sentence: what this is for, and when to reach for it. */
	readonly what: string;
	/**
	 * Whether the on-screen lens can narrow this file.
	 *
	 * False for the source, and not as an oversight. The `.eventstorm` file is
	 * the document — it is what the board is restored from and the only copy
	 * that survives this browser — and a filter is a way of *looking* at it. An
	 * export that silently dropped the cards somebody had filtered out would
	 * hand back a file that had lost half the workshop, and it would look
	 * exactly like a complete one.
	 */
	readonly lensApplies: boolean;
	/**
	 * Whether the board's day/night setting decides how this file looks.
	 *
	 * True for the two pictures and false for the two documents, and the dialog
	 * says so on the row. Which theme a picture came out in is not recoverable
	 * once it is in a downloads folder — it is simply the picture — so it has to
	 * be said before the file exists rather than discovered afterwards, and the
	 * way back is the board's own sun/moon button.
	 */
	readonly themed: boolean;
	readonly group: Group;
	/**
	 * A fixed stem for the filename, or `null` to name the file after the board.
	 *
	 * The reference documents are constant — the same bytes whatever is open —
	 * so naming one `ordering-a-pizza.notation.md` would be a filename making a
	 * claim the contents do not: that it is about that storm, and that a second
	 * one exported from a different board would differ. They get their own name,
	 * and two exports from two walls collide in the downloads folder, which is
	 * correct: they are the same file.
	 */
	readonly stem: string | null;
}

/**
 * The four, in the order the dialog offers them.
 *
 * The source first, because it is the one that is not optional: everything
 * below it is a rendering, and only this one can become a board again. Then the
 * two pictures, vector before raster since the raster is a photograph of it,
 * and the outline last because it is the one that is read rather than looked
 * at.
 */
export const DESTINATIONS: readonly Destination[] = [
	{
		id: 'source',
		label: 'Event storm source',
		extension: '.eventstorm',
		icon: 'exportFile',
		what: 'The document itself, exactly as it sits in the pane. The only one of these that can be opened back into a board.',
		lensApplies: false,
		themed: false,
		group: 'wall',
		stem: null,
	},
	{
		id: 'svg',
		label: 'Picture, as vector',
		extension: '.svg',
		icon: 'vector',
		what: 'The wall drawn at full size, with a legend. Scales without going soft — for print, or for editing in a drawing tool.',
		lensApplies: true,
		themed: true,
		group: 'wall',
		stem: null,
	},
	{
		id: 'png',
		label: 'Picture, as image',
		extension: '.png',
		icon: 'picture',
		what: 'The same drawing, rastered at 2×. What you paste into a slide, a ticket or a chat.',
		lensApplies: true,
		themed: true,
		group: 'wall',
		stem: null,
	},
	{
		id: 'outline',
		label: 'Outline',
		extension: '.md',
		icon: 'outline',
		what: 'Every lane, note and tag as Markdown. Searchable, diffable, and readable in a wiki or a pull request.',
		lensApplies: true,
		themed: false,
		group: 'wall',
		stem: null,
	},
	{
		id: 'notation',
		label: 'Notation reference',
		extension: '.md',
		icon: 'notation',
		what: 'The whole `.eventstorm` grammar, plus the rules for editing somebody else’s storm. Hand it to an agent working on a storm outside this tab.',
		lensApplies: false,
		themed: false,
		group: 'reference',
		stem: NOTATION_STEM,
	},
	{
		id: 'doctrine',
		label: 'Doctrine',
		extension: '.md',
		icon: 'doctrine',
		what: 'How the workshop runs and what a good wall does — including why the hotspots are not there to be resolved.',
		lensApplies: false,
		themed: false,
		group: 'reference',
		stem: DOCTRINE_STEM,
	},
];

export function destination(id: DestinationId): Destination {
	const found = DESTINATIONS.find((entry) => entry.id === id);
	if (found === undefined) throw new Error(`No export destination called ${id}.`);
	return found;
}

/** Everything the four of them draw on. Assembled once, by the board. */
export interface ExportRequest {
	readonly board: BoardState;
	/** The text in the pane. The source export is this, byte for byte. */
	readonly source: string;
	/**
	 * The lens the board is set to.
	 *
	 * Used only as the fallback caption for a file with no cards in it: what the
	 * picture and the outline say they are is read off their own contents. See
	 * `reaches`.
	 */
	readonly level: Level;
	/**
	 * What the filters are pointing at, or `null` when nothing is filtering.
	 *
	 * Passed even when the visitor has not asked for a narrowed export: the
	 * destinations that cannot honour it still have to be handed the same
	 * request, and `produce` is the one place that decides which those are.
	 */
	readonly matching: ReadonlySet<Id> | null;
	/** Whether the visitor ticked "only what the board is showing". */
	readonly onlyShowing: boolean;
	/** The theme the board is in. The picture is what you are looking at. */
	readonly dark: boolean;
}

/** The file this destination would produce, ready to be handed to the browser. */
export async function produce(id: DestinationId, request: ExportRequest): Promise<{ filename: string; blob: Blob }> {
	const { board } = request;
	const spec = destination(id);
	const filename =
		spec.stem === null
			? filenameFor(board.product, board.title, spec.extension)
			: `${spec.stem}${spec.extension}`;

	// The lens narrows a file only when the destination admits it *and* the
	// visitor asked. Two conditions, folded here rather than in each branch, so
	// a destination added later cannot forget one of them.
	const only = spec.lensApplies && request.onlyShowing ? request.matching : null;
	// And the caption describes the file, not the screen — see `reaches`.
	const level = reaches(board, only, request.level);

	switch (id) {
		case 'source':
			return { filename, blob: text(request.source, 'text/plain') };

		case 'svg':
			return {
				filename,
				blob: text(boardSvg(board, { only, dark: request.dark, level }).svg, 'image/svg+xml'),
			};

		case 'png':
			return {
				filename,
				blob: await svgToPng(boardSvg(board, { only, dark: request.dark, level })),
			};

		case 'outline':
			return { filename, blob: text(boardMarkdown(board, { only, level }), 'text/markdown') };

		// Neither reads the board. They are the practice, not this wall — see the
		// note at the top of src/lib/board/instructions.ts for why a tool ships
		// its own instructions at all.
		case 'notation':
			return { filename, blob: text(notationDocument(), 'text/markdown') };

		case 'doctrine':
			return { filename, blob: text(doctrineDocument(), 'text/markdown') };
	}
}

/**
 * The level a file's own contents reach — which is not always the lens.
 *
 * The picture and the outline both caption themselves with a level, and the
 * obvious thing to write there is the one the board is set to. It is wrong
 * whenever the export is not narrowed: a wall modelled to software design,
 * being *looked at* as a big picture, exports every card it has — commands,
 * policies and all — and a picture of those captioned "Big picture" is a
 * picture that contradicts itself in the corner.
 *
 * So the caption is read off the cards that made it into the file. When the
 * lens narrowed the export, that is the lens; when it did not, it is however
 * far the wall actually goes. One rule, and it cannot disagree with the
 * contents because it is derived from them.
 *
 * `fallback` is for a file with no cards at all — an empty wall, or a filter
 * that matched nothing. There is nothing to read a level off, and the visitor's
 * own lens is the least surprising thing to say.
 */
function reaches(board: BoardState, only: ReadonlySet<Id> | null, fallback: Level): Level {
	let deepest = -1;
	for (const [id, card] of Object.entries(board.cards)) {
		if (only !== null && !only.has(id)) continue;
		const depth = LEVELS.indexOf(levelOfKind[card.kind]);
		if (depth > deepest) deepest = depth;
	}
	return LEVELS[deepest] ?? fallback;
}

/** An explicit charset on every one of them: titles are not necessarily ASCII. */
function text(value: string, type: string): Blob {
	return new Blob([value], { type: `${type};charset=utf-8` });
}
