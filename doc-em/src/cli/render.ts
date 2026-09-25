/**
 * The map, rendered without a browser.
 *
 *   render [<input>|-] [-o <output>|-] [--format svg|png|md] [--scale N]
 *
 * Reads a `.examplemap` file (stdin when there is none, or `-`) and writes one
 * of the export dialog's map destinations: the picture as SVG or PNG, the
 * outline as Markdown, or the story's scenarios as a Gherkin `.feature`. The
 * format is read off the output's extension, or given
 * with `--format` when writing to stdout.
 *
 * It ships in the same image as the board — `docker run -i <image> render …` —
 * and it goes through the same `produce` the dialog does. A second renderer
 * would be a second picture of the map to keep in step, and the one in CI
 * would be the one nobody looks at.
 *
 * ## What differs from the dialog
 *
 * Only what a browser supplied:
 *
 * - The colours. The picture reads them off the live stylesheet; here there is
 *   none, so global.css is bundled as text (`?raw`, as Vite spells it) and
 *   its tokens handed to the palette — the same declarations, read from the
 *   same file.
 * - The raster. `svgToPng` goes through `<img>` and a canvas; here resvg draws
 *   the very same SVG.
 * - The theme. Always daylight: a file rendered in a pipeline has no board whose
 *   sun/moon button it could be following.
 * - The lens. There is no filter to narrow by, so every card is drawn.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { parseArgs } from 'node:util';
import { Resvg } from '@resvg/resvg-js';
import css from '../styles/global.css?raw';
import { toBoard } from '../lib/board/convert.ts';
import { produce, type DestinationId } from '../lib/board/export.ts';
import { setTokenSource } from '../lib/board/palette.ts';
import { unwritableQuestions } from '../lib/examplemap/gherkin.ts';
import { parse } from '../lib/examplemap/parser.ts';
import { ExampleMapParseError } from '../lib/examplemap/problems.ts';

/** The formats this tool writes, and the export destination behind each. */
const FORMATS: Record<string, DestinationId> = { svg: 'svg', png: 'png', md: 'outline', feature: 'gherkin' };

const USAGE = `usage: render [<input.examplemap>|-] [-o <output>|-] [--format ${Object.keys(FORMATS).join('|')}] [--scale N]`;

class UsageError extends Error {}

async function main(argv: readonly string[]): Promise<void> {
	const { values, positionals } = parseArgs({
		args: [...argv],
		allowPositionals: true,
		options: {
			output: { type: 'string', short: 'o' },
			format: { type: 'string', short: 'f' },
			scale: { type: 'string' },
			help: { type: 'boolean', short: 'h' },
		},
	});
	if (values.help) {
		process.stdout.write(`${USAGE}\n`);
		return;
	}
	if (positionals.length > 1) throw new UsageError('One input file at a time.');

	const input = positionals[0] ?? '-';
	const output = values.output ?? '-';
	const format = values.format ?? (output === '-' ? undefined : extname(output).slice(1).toLowerCase());
	if (format === undefined) throw new UsageError('Writing to stdout needs --format.');
	const id = FORMATS[format];
	if (id === undefined) throw new UsageError(`Cannot write .${format}; expected one of ${Object.keys(FORMATS).join(', ')}.`);

	const scale = values.scale === undefined ? 2 : Number(values.scale);
	if (!(scale > 0)) throw new UsageError(`--scale must be a positive number, not ${values.scale}.`);

	setTokenSource(tokens(css));

	const source = readFileSync(input === '-' ? 0 : input, 'utf8');
	const document = parse(source);
	const board = toBoard(document);
	const request = { board, source, document, matching: null, onlyShowing: false, dark: false };

	// The dialog says this on the Gherkin row; here it has to be said on stderr,
	// or a question left open on the map just silently goes missing from the
	// feature file.
	const open = id === 'gherkin' ? unwritableQuestions(document) : 0;
	if (open > 0) {
		process.stderr.write(`warning: ${open} open question${open === 1 ? '' : 's'} left out of the feature file.\n`);
	}

	// The PNG is a photograph of the SVG, as in the dialog — see `svgToPng`.
	const bytes =
		id === 'png'
			? rasterise(await (await produce('svg', request)).blob.text(), scale)
			: Buffer.from(await (await produce(id, request)).blob.arrayBuffer());

	if (output === '-') process.stdout.write(bytes);
	else writeFileSync(output, bytes);
}

/**
 * Every `--color-*` declaration in the stylesheet, by name.
 *
 * The first declaration wins. They all sit in the one `@theme` block today;
 * should an override ever appear under a media query further down, it would be
 * the night of some other rule and not the daylight this renders.
 */
function tokens(stylesheet: string): (name: string) => string | undefined {
	const found = new Map<string, string>();
	for (const [, name, value] of stylesheet.matchAll(/(--color-[\w-]+)\s*:\s*([^;]+);/g)) {
		if (!found.has(name!)) found.set(name!, value!.trim());
	}
	return (name) => found.get(name);
}

/**
 * The SVG to PNG, at `scale`.
 *
 * System fonts, with sans-serif as the default: the picture's `FONT` stack asks
 * for generic families only, and the image carries DejaVu so there is always
 * one to find.
 */
function rasterise(svg: string, scale: number): Buffer {
	const resvg = new Resvg(svg, {
		fitTo: { mode: 'zoom', value: scale },
		font: { loadSystemFonts: true, defaultFontFamily: 'DejaVu Sans', sansSerifFamily: 'DejaVu Sans' },
	});
	return resvg.render().asPng();
}

main(process.argv.slice(2)).catch((error: unknown) => {
	if (error instanceof ExampleMapParseError) {
		for (const problem of error.problems) {
			process.stderr.write(`${problem.line}:${problem.column} ${problem.message}\n`);
		}
		process.exitCode = 1;
	} else if (error instanceof UsageError || (error instanceof Error && 'code' in error && String(error.code).startsWith('ERR_PARSE_ARGS'))) {
		process.stderr.write(`${error.message}\n${USAGE}\n`);
		process.exitCode = 2;
	} else {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exitCode = 1;
	}
});
