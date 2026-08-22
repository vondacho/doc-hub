/**
 * Getting a file in and a file out of the browser.
 *
 * Thirty lines with no domain vocabulary, so doc-es will want it verbatim too.
 * Every comment below marks something that goes wrong silently — which is the
 * only reason this is a module rather than four inline statements.
 */

import { storageKey } from './storage.ts';

/** The extension doc-es reads and writes. */
export const EVENTSTORM_EXTENSION = '.eventstorm';

/** What the file picker offers. `text/plain` so a renamed `.txt` is still reachable. */
export const EVENTSTORM_ACCEPT = '.eventstorm,text/plain';

/**
 * Read a picked file as text.
 *
 * `file.text()` rather than FileReader — the callback API solves a problem that
 * no longer exists. Encoding quirks (a BOM, CRLF line endings, NUL bytes, an
 * absurd size) are all handled in the lexer rather than here, so that a future
 * paste-into-a-textarea import gets exactly the same treatment for free.
 */
export async function readTextFile(file: File): Promise<string> {
	return await file.text();
}

/**
 * Clear a file input after reading it.
 *
 * A `change` event does not fire when the same file is picked twice, so without
 * this "fix the file and import it again" silently does nothing — and it looks
 * exactly like an import that succeeded, which is the worst possible failure.
 */
export function clearFileInput(input: HTMLInputElement | null): void {
	if (input) input.value = '';
}

/** Hand the visitor a file to save. */
export function downloadText(filename: string, text: string): void {
	// `text/plain` so the browser offers to save it rather than trying to render
	// it, and an explicit charset because the titles are not necessarily ASCII.
	const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
	const url = URL.createObjectURL(blob);

	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	// Safari will not follow a download from an anchor that is not in the
	// document. Appending it is not superstition.
	anchor.style.display = 'none';
	document.body.append(anchor);
	anchor.click();
	anchor.remove();

	// Revoking immediately after click() cancels the download in some browsers:
	// the navigation has not started yet, and the object URL is already gone.
	// Deferring by a tick is the fix, and the bug it prevents reproduces
	// intermittently, which is the kind that survives review.
	setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * A filename for a map: `<product>_<title>.eventstorm`.
 *
 * The same stem the browser stores the board under — see `storageKey` in
 * src/lib/storage.ts, which is where the composition and the slugging live. One
 * name for one board, whether it is sitting in a downloads folder or in
 * `localStorage`, so the two are recognisably the same thing.
 *
 * Composed here rather than duplicated: a title with a slash in it produces a
 * download the browser silently refuses, and that hazard and the key's are the
 * same hazard.
 */
export function filenameFor(product: string | null, title: string): string {
	return `${storageKey(product, title)}${EVENTSTORM_EXTENSION}`;
}
