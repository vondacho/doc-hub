/**
 * Getting a file in and a file out of the browser.
 *
 * Thirty lines with no domain vocabulary, so doc-em and doc-es want it verbatim.
 * Every comment below marks something that goes wrong silently — which is the
 * only reason this is a module rather than four inline statements.
 */

/** The extension doc-sm reads and writes. `.sm` is Standard ML's, in every editor. */
export const STORYMAP_EXTENSION = '.storymap';

/** What the file picker offers. `text/plain` so a renamed `.txt` is still reachable. */
export const STORYMAP_ACCEPT = '.storymap,text/plain';

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
 * A filename for a map title.
 *
 * A title with a slash in it produces a download the browser silently refuses,
 * so separators and control characters go before anything else does.
 */
export function filenameFor(title: string): string {
	// An allowlist rather than a list of characters to strip: path separators
	// and control characters are what actually break a download, but enumerating
	// everything a title might contain is a losing game — titles are free text and
	// may be in any script.
	const slug = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60)
		.replace(/-+$/, '');
	return `${slug === '' ? 'untitled' : slug}${STORYMAP_EXTENSION}`;
}
