/**
 * The file this board would export, without exporting it.
 *
 * Worth having because the `.storymap` file is the actual artefact — it is what
 * gets committed and reviewed — and until now the only way to see it was to
 * download it. The preview also makes the format teach itself: move a card, open
 * this, and the line that changed is visible.
 *
 * Built on the native `<dialog>` element rather than a div with a high z-index.
 * `showModal()` brings the focus trap, the inert background, the Escape key and
 * the top-layer stacking with it — all of which would otherwise be hand-written,
 * and three of which are usually hand-written wrong.
 */

import { useEffect, useRef, useState } from 'react';
import { IconButton } from './IconButton.tsx';

export function PreviewDialog({
	open,
	filename,
	text,
	onClose,
}: {
	open: boolean;
	filename: string;
	text: string;
	onClose: () => void;
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	const output = useRef<HTMLPreElement>(null);
	const [copied, setCopied] = useState<'idle' | 'done' | 'manual'>('idle');

	useEffect(() => {
		const element = dialog.current;
		if (!element) return;
		if (open && !element.open) element.showModal();
		if (!open && element.open) element.close();
	}, [open]);

	// Escape and the backdrop close it natively, without React knowing, so the
	// element's own close event is what state follows — not the other way round.
	useEffect(() => {
		const element = dialog.current;
		if (!element) return;
		const closed = () => onClose();
		element.addEventListener('close', closed);
		return () => element.removeEventListener('close', closed);
	}, [onClose]);

	useEffect(() => {
		if (open) setCopied('idle');
	}, [open]);

	const copy = async () => {
		const done = await copyText(text);
		if (done) {
			setCopied('done');
			// Long enough to read, short enough that the button is not stuck
			// looking like a checkmark next time it is glanced at.
			setTimeout(() => setCopied('idle'), 2000);
			return;
		}
		// Nothing could write to the clipboard, so select the text and say so.
		// Telling somebody to press a key is a poor outcome; leaving them with a
		// button that silently did nothing is a worse one.
		selectContents(output.current);
		setCopied('manual');
	};

	return (
		<dialog
			ref={dialog}
			aria-labelledby="preview-title"
			className="m-auto w-[min(56rem,92vw)] rounded-2xl border border-slate-200 bg-white p-0 text-ink backdrop:bg-black/50 dark:border-slate-700 dark:bg-night-raised dark:text-slate-100"
		>
			<div className="flex items-baseline justify-between gap-4 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
				<div>
					<h2 id="preview-title" className="text-sm font-semibold">
						The file this board would export
					</h2>
					<p className="mt-0.5 font-mono text-xs text-ink-muted dark:text-slate-400">{filename}</p>
				</div>
				<div className="flex items-center gap-2">
					<IconButton
						icon={copied === 'done' ? 'check' : 'copy'}
						label={copied === 'done' ? 'Copied' : 'Copy to clipboard'}
						onClick={copy}
					/>
					<IconButton icon="close" label="Close preview" onClick={onClose} />
				</div>
			</div>

			{/* Announced rather than merely shown: the button's own glyph changes,
			    but a change of glyph is not something a screen reader reports. */}
			<p aria-live="polite" className="sr-only">
				{copied === 'done' ? 'Copied to the clipboard.' : ''}
			</p>

			{copied === 'manual' && (
				<p className="border-b border-slate-200 bg-warning/10 px-5 py-2 text-xs dark:border-slate-700">
					This browser would not let the page write to the clipboard. The text is selected — press
					<kbd className="mx-1 rounded border border-slate-300 px-1 dark:border-slate-600">⌘C</kbd>
					or
					<kbd className="mx-1 rounded border border-slate-300 px-1 dark:border-slate-600">Ctrl+C</kbd>
					to copy it.
				</p>
			)}

			<pre
				ref={output}
				tabIndex={0}
				className="max-h-[60vh] overflow-auto px-5 py-4 text-xs leading-relaxed focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
			>
				<code>{text}</code>
			</pre>

			<p className="border-t border-slate-200 px-5 py-3 text-xs text-ink-muted dark:border-slate-700 dark:text-slate-400">
				This is a render of the board, not a saved file. Nothing is written anywhere until you export.
			</p>
		</dialog>
	);
}

/**
 * Put text on the clipboard, or report that it could not be done.
 *
 * The modern API needs a **secure context**, and doc-sm is served over plain
 * HTTP through the cluster's ingress. Chrome and Firefox treat `*.localhost` as
 * trustworthy, so it works on a local cluster and would quietly stop working the
 * first time this is deployed somewhere real without TLS — which is exactly the
 * kind of failure that gets discovered by a person, in a workshop, with no way
 * to get their file out.
 *
 * Hence the `execCommand` fallback. It is deprecated and it is also the only
 * thing that works in that case.
 */
async function copyText(text: string): Promise<boolean> {
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
		document.body.append(scratch);
		scratch.select();
		const done = document.execCommand('copy');
		scratch.remove();
		return done;
	} catch {
		return false;
	}
}

function selectContents(element: HTMLElement | null): void {
	if (!element) return;
	const range = document.createRange();
	range.selectNodeContents(element);
	const selection = window.getSelection();
	selection?.removeAllRanges();
	selection?.addRange(range);
	element.focus();
}
