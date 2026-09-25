/**
 * Bundles src/cli/render.ts into dist/cli/render.mjs, next to the server.
 *
 * esbuild rather than a second Astro/Vite config: the CLI is one entry with no
 * pages, no JSX and no client, and esbuild is already in the tree underneath
 * Vite. The one thing it does not know is Vite's `?raw` suffix, which the CLI
 * uses to carry global.css as text (typed by vite/client, so `astro check` is
 * happy with it) — hence the plugin.
 *
 * @resvg/resvg-js stays external: it is a native addon, resolved from the
 * image's production node_modules at run time.
 */

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));

/** `import x from './file?raw'` → the file's contents, as a string. */
const raw = {
	name: 'raw',
	setup(esbuild) {
		esbuild.onResolve({ filter: /\?raw$/ }, (args) => ({
			path: resolve(args.resolveDir, args.path.slice(0, -'?raw'.length)),
			namespace: 'raw',
		}));
		esbuild.onLoad({ filter: /.*/, namespace: 'raw' }, async (args) => ({
			contents: await readFile(args.path, 'utf8'),
			loader: 'text',
		}));
	},
};

await build({
	entryPoints: [resolve(here, 'render.ts')],
	outfile: resolve(here, '../../dist/cli/render.mjs'),
	bundle: true,
	platform: 'node',
	format: 'esm',
	target: 'node22',
	external: ['@resvg/resvg-js'],
	plugins: [raw],
	logLevel: 'warning',
});
