/**
 * Getting a file in and a file out of the browser.
 *
 * Thirty lines with no domain vocabulary, so doc-es will want it verbatim too.
 * Every comment below marks something that goes wrong silently — which is the
 * only reason this is a module rather than four inline statements.
 */

import { storageKey } from './storage.ts';

/** The extension doc-em reads and writes. */
export const EXAMPLEMAP_EXTENSION = '.examplemap';

/** What the file picker offers. `text/plain` so a renamed `.txt` is still reachable. */
export const EXAMPLEMAP_ACCEPT = '.examplemap,text/plain';

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
 * A filename for a map: `<product>_<title>.examplemap`.
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
	return `${storageKey(product, title)}${EXAMPLEMAP_EXTENSION}`;
}

/**
 * Put text on the clipboard, by whichever route the browser allows.
 *
 * Lifted out of the preview dialog when that was replaced, because it is not a
 * fact about dialogs: any surface offering to copy something needs both routes.
 *
 * The async API first, then a hidden textarea and `execCommand`. The fallback is
 * deprecated and still the only thing that works in an insecure context or when
 * the permission is refused, and `false` from both is what lets the caller say
 * so rather than leaving a button that silently did nothing.
 */
export async function copyText(text: string): Promise<boolean> {
	try {
		if (window.isSecureContext && navigator.clipboard) {
			await navigator.clipboard.writeText(text);
			return true;
		}
	} catch {
		// Permission refused, or a browser that rejects a write it did not tie to
		// a gesture it recognises. Fall through rather than give up.
	}

	try {
		const scratch = document.createElement('textarea');
		scratch.value = text;
		// Off-screen rather than hidden: `display: none` cannot be selected, and
		// an element the viewport can see would scroll the page on focus.
		scratch.setAttribute('readonly', '');
		scratch.style.position = 'fixed';
		scratch.style.top = '-1000px';
		document.body.appendChild(scratch);
		scratch.select();
		const done = document.execCommand('copy');
		document.body.removeChild(scratch);
		return done;
	} catch {
		return false;
	}
}
