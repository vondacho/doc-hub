/**
 * Where a map can go, and what it becomes on the way.
 *
 * One place that knows the seven destinations, so nothing else has to. The
 * dialog reads this list to draw its rows; the board hands it a request and
 * gets files back. Neither of them knows what an SVG is, and neither of them
 * composes a filename.
 *
 * ## Why a list, and not seven buttons
 *
 * A toolbar with seven export buttons on it is a toolbar where the common
 * gesture — take the file — has become a thing you have to aim at. It also has
 * no room to say what any of them *are*: "SVG" and "Markdown" are formats, and
 * the question somebody actually has is "which of these do I put in the deck".
 * A row can carry a sentence; a 36px button cannot.
 *
 * And several destinations are frequently wanted at once. The picture goes in
 * the deck, the outline goes in the ticket, the feature file goes in the test
 * suite, and the `.examplemap` is the copy that survives — that is one gesture
 * with four outcomes, not four gestures.
 *
 * ## Gherkin is a destination, and the preview stays
 *
 * The toolbar keeps its own button that *shows* the feature file, and that is
 * not a duplicate. A file that lands in your downloads folder unseen is a poor
 * way to learn what it says — the argument at the top of GherkinDialog, still
 * true — so "show me the Gherkin" and "give me the Gherkin along with the other
 * four files" are two different gestures with two different answers. The
 * preview is for reading; this row is for taking.
 *
 * The row carries the same warning the preview does. A map with open questions
 * produces a feature file quietly missing them, and a count discovered by
 * diffing two files afterwards is a count discovered too late — so the dialog
 * is told how many, and says so on the row before anything is written.
 *
 * ## Two groups
 *
 * Five renderings of the map on screen, and two reference documents that are
 * the same bytes from any board — see src/lib/board/instructions.ts for why a
 * tool ships its own instructions at all.
 *
 * ## What "produce" promises
 *
 * A filename and a blob, and no side effect. Nothing here touches the DOM
 * except through `boardSvg`'s palette read and the canvas the PNG is rastered
 * on, and nothing here downloads anything: the caller decides what to do with
 * the file, which is what makes a run of several of them one loop rather than
 * seven special cases.
 */

import type { ExampleMapDocument } from '../examplemap/model.ts';
import { featureFilename, toGherkin } from '../examplemap/gherkin.ts';
import type { IconName } from './icons.ts';
import type { BoardState, Id } from './state.ts';
import { boardSvg, svgToPng } from './picture.ts';
import { boardMarkdown } from './outline.ts';
import { DOCTRINE_STEM, doctrineDocument, NOTATION_STEM, notationDocument } from './instructions.ts';
import { filenameFor } from '../files.ts';

export type DestinationId = 'source' | 'gherkin' | 'svg' | 'png' | 'outline' | 'notation' | 'doctrine';

/**
 * Which half of the dialog a destination belongs in.
 *
 * `map` is something this map produced; `reference` is a document about the
 * practice, identical whatever is open.
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
	 * False for the source, and not as an oversight: the `.examplemap` file is
	 * the document — what the board is restored from and the only copy that
	 * survives this browser — and a filter is a way of *looking* at it.
	 *
	 * False for the Gherkin too, and for a sharper reason. A feature file is
	 * executed. One built from a filtered map would be a test suite silently
	 * missing scenarios, passing green, and asserting less than the team thinks
	 * it asserts — which is worse than no feature file at all.
	 */
	readonly lensApplies: boolean;
	/**
	 * Whether the board's day/night setting decides how this file looks.
	 *
	 * True for the two pictures and false for the five documents, and the dialog
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
	 * so naming one `redeem-a-voucher.notation.md` would be a filename making a
	 * claim the contents do not.
	 *
	 * The Gherkin is `null` here and still does not use the board's stem: a
	 * `.feature` file is named after the *story*, because that is what a runner
	 * globs for and what a developer looks for beside the code. `produce` is
	 * where that exception lives, and `featureFilename` is where the rule does.
	 */
	readonly stem: string | null;
}

/**
 * The seven, in the order the dialog offers them.
 *
 * The source first, because it is the one that is not optional: everything
 * below it is derived, and only this one can become a board again. The Gherkin
 * second, because it is the one thing the session *produces* rather than a
 * picture of what it produced. Then the two pictures, vector before raster
 * since the raster is a photograph of it, then the outline, then the two
 * reference documents.
 */
export const DESTINATIONS: readonly Destination[] = [
	{
		id: 'source',
		label: 'Example map source',
		extension: '.examplemap',
		icon: 'exportFile',
		what: 'The document itself, exactly as it sits in the pane. The only one of these that can be opened back into a board.',
		lensApplies: false,
		themed: false,
		group: 'map',
		stem: null,
	},
	{
		id: 'gherkin',
		label: 'Feature file',
		extension: '.feature',
		icon: 'gherkin',
		what: 'The green cards as Gherkin scenarios, named after the story. What goes in the test suite — the red cards have no Gherkin and do not survive the trip.',
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
		what: 'The whole map at full size — the story, every rule with its questions, and the examples in their bands. Scales without going soft.',
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
		what: 'Every rule, example, question and tag as Markdown — led by what the shape of the map is telling you. Searchable, diffable, readable in a wiki.',
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
		what: 'The whole `.examplemap` grammar, plus the rules for editing somebody else’s map. Hand it to an agent working on a map outside this tab.',
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
		what: 'How the session runs and what a good map does — including why the red cards are not there to be answered.',
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

/** Everything the seven of them draw on. Assembled once, by the board. */
export interface ExportRequest {
	readonly board: BoardState;
	/** The text in the pane. The source export is this, byte for byte. */
	readonly source: string;
	/**
	 * The parsed document, or `null` while the source does not parse.
	 *
	 * The Gherkin writer works from the file model rather than the board — see
	 * `toGherkin` — because a scenario is the document's own shape and nothing
	 * about a grid. Null is not an error case to guard against elsewhere: the
	 * dialog does not offer the row when there is nothing to write from.
	 */
	readonly document: ExampleMapDocument | null;
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

		case 'gherkin': {
			// Guarded rather than assumed. The dialog hides the row when the source
			// does not parse, but a catalogue that trusted a caller to have done
			// that would be one refactor away from writing an empty feature file
			// into somebody's test suite.
			if (request.document === null) {
				throw new Error('The source does not parse, so there is no feature file to write.');
			}
			// Its own name, not the board's stem — see `stem` above.
			return {
				filename: featureFilename(request.document),
				blob: text(toGherkin(request.document), 'text/plain'),
			};
		}

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
