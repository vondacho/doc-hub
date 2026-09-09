/**
 * Where a map can go, and what it becomes on the way.
 *
 * One place that knows the six destinations, so nothing else has to. The dialog
 * reads this list to draw its rows; the board hands it a request and gets files
 * back. Neither of them knows what an SVG is, and neither of them composes a
 * filename.
 *
 * ## Why a list, and not six buttons
 *
 * A toolbar with six export buttons on it is a toolbar where the common gesture
 * — take the file — has become a thing you have to aim at. It also has no room
 * to say what any of them *are*: "SVG" and "Markdown" are formats, and the
 * question somebody actually has is "which of these do I put in the deck". A
 * row can carry a sentence; a 36px button cannot.
 *
 * And several destinations are frequently wanted at once. The picture goes in
 * the deck, the outline goes in the ticket, and the `.storymap` is the copy
 * that survives — that is one gesture with three outcomes, not three gestures.
 *
 * ## Two groups
 *
 * Four renderings of the map on screen, and two reference documents that are
 * the same bytes from any board — see src/lib/board/instructions.ts for why a
 * tool ships its own instructions at all. The dialog fences them off under
 * their own heading; a flat list of six would invite reading "Outline" and
 * "Doctrine" as two renderings of the same map.
 *
 * ## What "produce" promises
 *
 * A filename and a blob, and no side effect. Nothing here touches the DOM
 * except through `boardSvg`'s palette read and the canvas the PNG is rastered
 * on, and nothing here downloads anything: the caller decides what to do with
 * the file, which is what makes a run of several of them one loop rather than
 * six special cases.
 */

import type { IconName } from './icons.ts';
import type { BoardState, Id } from './state.ts';
import { boardSvg, svgToPng } from './picture.ts';
import { boardMarkdown } from './outline.ts';
import { DOCTRINE_STEM, doctrineDocument, NOTATION_STEM, notationDocument } from './instructions.ts';
import { filenameFor } from '../files.ts';

export type DestinationId = 'source' | 'svg' | 'png' | 'outline' | 'notation' | 'doctrine';

/**
 * Which half of the dialog a destination belongs in.
 *
 * `map` is a rendering of the story map on screen; `reference` is a document
 * about the practice, identical whatever is open.
 */
export type Group = 'map' | 'reference';

export interface Destination {
	readonly id: DestinationId;
	/** The row's heading. What the file is, not what the format is called. */
	readonly label: string;
	readonly extension: string;
	readonly icon: IconName;
	/** One sentence: what this is for, and when to reach for it. */
	readonly what: string;
	/**
	 * Whether the tag filter can narrow this file.
	 *
	 * False for the source, and not as an oversight. The `.storymap` file is the
	 * document — it is what the board is restored from and the only copy that
	 * survives this browser — and a filter is a way of *looking* at it. An
	 * export that silently dropped the cards somebody had filtered out would
	 * hand back a file that had lost half the plan, and it would look exactly
	 * like a complete one.
	 */
	readonly lensApplies: boolean;
	/**
	 * Whether the board's day/night setting decides how this file looks.
	 *
	 * True for the two pictures and false for the four documents, and the dialog
	 * says so on the row. Which theme a picture came out in is not recoverable
	 * once it is in a downloads folder — it is simply the picture — so it has to
	 * be said before the file exists rather than discovered afterwards.
	 */
	readonly themed: boolean;
	readonly group: Group;
	/**
	 * A fixed stem for the filename, or `null` to name the file after the board.
	 *
	 * The reference documents are constant — the same bytes whatever is open —
	 * so naming one `doc-hub-onboarding.notation.md` would be a filename making
	 * a claim the contents do not: that it is about that map, and that a second
	 * one exported from a different board would differ. They get their own name,
	 * and two exports from two maps collide in the downloads folder, which is
	 * correct: they are the same file.
	 */
	readonly stem: string | null;
}

/**
 * The six, in the order the dialog offers them.
 *
 * The source first, because it is the one that is not optional: everything
 * below it is a rendering, and only this one can become a board again. Then the
 * two pictures, vector before raster since the raster is a photograph of it,
 * then the outline because it is read rather than looked at, and the two
 * reference documents last.
 */
export const DESTINATIONS: readonly Destination[] = [
	{
		id: 'source',
		label: 'Story map source',
		extension: '.storymap',
		icon: 'exportFile',
		what: 'The document itself, exactly as it sits in the pane. The only one of these that can be opened back into a board.',
		lensApplies: false,
		themed: false,
		group: 'map',
		stem: null,
	},
	{
		id: 'svg',
		label: 'Picture, as vector',
		extension: '.svg',
		icon: 'vector',
		what: 'The whole map at full size — spanning backbone, every band, and the gaps where a delivery leaves an activity empty. Scales without going soft.',
		lensApplies: true,
		themed: true,
		group: 'map',
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
		group: 'map',
		stem: null,
	},
	{
		id: 'outline',
		label: 'Outline',
		extension: '.md',
		icon: 'outline',
		what: 'Every activity, step, story and tag as Markdown — with what each delivery leaves untouched spelled out. Searchable, diffable, readable in a wiki.',
		lensApplies: true,
		themed: false,
		group: 'map',
		stem: null,
	},
	{
		id: 'notation',
		label: 'Notation reference',
		extension: '.md',
		icon: 'notation',
		what: 'The whole `.storymap` grammar, plus the rules for editing somebody else’s map. Hand it to an agent working on a map outside this tab.',
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
		what: 'Where a backbone comes from and what a good map does — including why the unscheduled stories are not there to be tidied away.',
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

/** Everything the six of them draw on. Assembled once, by the board. */
export interface ExportRequest {
	readonly board: BoardState;
	/** The text in the pane. The source export is this, byte for byte. */
	readonly source: string;
	/**
	 * What the tag filter is pointing at, or `null` when nothing is filtering.
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

	// The filter narrows a file only when the destination admits it *and* the
	// visitor asked. Two conditions, folded here rather than in each branch, so
	// a destination added later cannot forget one of them.
	const only = spec.lensApplies && request.onlyShowing ? request.matching : null;

	switch (id) {
		case 'source':
			return { filename, blob: text(request.source, 'text/plain') };

		case 'svg':
			return { filename, blob: text(boardSvg(board, { only, dark: request.dark }).svg, 'image/svg+xml') };

		case 'png':
			return { filename, blob: await svgToPng(boardSvg(board, { only, dark: request.dark })) };

		case 'outline':
			return { filename, blob: text(boardMarkdown(board, { only }), 'text/markdown') };

		// Neither reads the board. They are the practice, not this map — see the
		// note at the top of src/lib/board/instructions.ts for why a tool ships
		// its own instructions at all.
		case 'notation':
			return { filename, blob: text(notationDocument(), 'text/markdown') };

		case 'doctrine':
			return { filename, blob: text(doctrineDocument(), 'text/markdown') };
	}
}

/** An explicit charset on every one of them: titles are not necessarily ASCII. */
function text(value: string, type: string): Blob {
	return new Blob([value], { type: `${type};charset=utf-8` });
}
