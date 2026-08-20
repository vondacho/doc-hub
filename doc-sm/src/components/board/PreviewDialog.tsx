/**
 * The `.storymap` file this board would export — readable, and editable.
 *
 * Worth having because the file is the actual artefact: it is what gets
 * committed and reviewed, and until this existed the only way to see it was to
 * download it. Making it editable turns it into the second way to change a
 * board, and for some changes it is plainly the better one — renaming six
 * stories, or reordering a whole activity, is a find-and-replace here and twelve
 * drags out there.
 *
 * Built on the native `<dialog>` element rather than a div with a high z-index.
 * `showModal()` brings the focus trap, the inert background, the Escape key and
 * the top-layer stacking with it — all of which would otherwise be hand-written,
 * and three of which are usually hand-written wrong.
 *
 * ## The text is a snapshot, not a live view
 *
 * The dialog is modal, so the board behind it cannot change while it is open.
 * The draft is seeded when the dialog opens and belongs to the visitor from then
 * on: it is not overwritten from the board, and closing without applying
 * discards it. The footer says so, because a text box that silently throws work
 * away is the wrong kind of surprise.
 *
 * ## The product line is inert here
 *
 * `product "…"` round-trips through this text like everything else, but editing
 * it does nothing. The product is owned by the picker above the board, which
 * validates it against the registry; letting a free-text edit override that
 * would put an unregistered or misspelled shortname into a file with nothing to
 * catch it. The note beside the editor says so up front rather than leaving it
 * to be discovered by an edit that appears to have been ignored — which it has.
 */

import { useEffect, useRef, useState } from 'react';
import type { Problem } from '../../lib/storymap/problems.ts';
import { IconButton } from './IconButton.tsx';
import { ProblemList } from './ProblemList.tsx';

/** Empty problems means the text was applied and the dialog may close. */
export type ApplyResult = readonly Problem[];

export function PreviewDialog({
	open,
	filename,
	text,
	onApply,
	onClose,
}: {
	open: boolean;
	filename: string;
	text: string;
	onApply: (source: string) => ApplyResult;
	onClose: () => void;
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	const editor = useRef<HTMLTextAreaElement>(null);
	const [draft, setDraft] = useState(text);
	const [problems, setProblems] = useState<readonly Problem[]>([]);
	const [copied, setCopied] = useState<'idle' | 'done' | 'manual'>('idle');

	useEffect(() => {
		const element = dialog.current;
		if (!element) return;
		if (open && !element.open) element.showModal();
		if (!open && element.open) element.close();
	}, [open]);

	// Seed on open, and only on open. After that the draft is the visitor's.
	useEffect(() => {
		if (!open) return;
		setDraft(text);
		setProblems([]);
		setCopied('idle');
		// `text` is intentionally not a dependency: re-seeding mid-edit would
		// discard what somebody was typing.
		// eslint-disable-next-line react-hooks/exhaustive-deps
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

	const dirty = draft !== text;

	const copy = async () => {
		const done = await copyText(draft);
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
		editor.current?.select();
		setCopied('manual');
	};

	const apply = () => {
		const found = onApply(draft);
		setProblems(found);
		// Nothing is closed and nothing is lost on a bad parse: the text stays
		// exactly as typed, with the line and column of each problem beside it.
		if (found.length === 0) onClose();
	};

	// No `display` utility on the <dialog> itself — not even `flex`.
	//
	// The browser hides a closed dialog with `dialog:not([open]) { display: none }`
	// from its *user-agent* stylesheet, and any author rule beats a UA rule
	// regardless of specificity. One `flex` class here therefore pins the dialog
	// open forever: it renders inline in the page flow, before it is ever opened
	// and after close() alike, with no backdrop and no way to dismiss it.
	//
	// global.css restates the UA rule as an author rule so a display utility
	// landing here again cannot resurrect the bug, but the right fix is still to
	// lay the contents out on an inner element, which is what the div below is.
	return (
		<dialog
			ref={dialog}
			aria-labelledby="preview-title"
			className="m-auto w-[min(56rem,92vw)] rounded-2xl border border-slate-200 bg-white p-0 text-ink backdrop:bg-black/50 dark:border-slate-700 dark:bg-night-raised dark:text-slate-100"
		>
			<div className="flex max-h-[85vh] flex-col">
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
						<IconButton
							icon="apply"
							label="Apply this text to the board"
							tone="primary"
							disabled={!dirty}
							onClick={apply}
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

				{problems.length > 0 && (
					<div className="px-5 pt-4">
						<ProblemList problems={problems} subject="This text" onDismiss={() => setProblems([])} />
					</div>
				)}

				<label className="sr-only" htmlFor="preview-editor">
					The story map as text. Edit it, then apply it to the board.
				</label>
				<textarea
					id="preview-editor"
					ref={editor}
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					spellCheck={false}
					// Tab moves focus rather than inserting a tab, which is the default
					// and is kept deliberately: trapping Tab in a textarea strands
					// keyboard users, and the format is whitespace-insensitive, so there
					// is nothing to indent with.
					className="min-h-[45vh] w-full flex-1 resize-none border-0 bg-transparent px-5 py-4 font-mono text-xs leading-relaxed focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
				/>

				<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-slate-200 px-5 py-3 text-xs text-ink-muted dark:border-slate-700 dark:text-slate-400">
					<p>
						{dirty
							? 'Apply to put this text on the board, or close to discard it. Undo will bring the old board back.'
							: 'A render of the board, not a saved file. Nothing is written anywhere until you export.'}
					</p>
					{/* Stated up front, not after an edit that appears to have been
					    ignored — because it has been. */}
					<p>
						The <code className="font-mono">product</code> line is set by the picker and is ignored here.
					</p>
				</div>
			</div>
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
