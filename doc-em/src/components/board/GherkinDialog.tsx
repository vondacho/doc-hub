/**
 * The feature file this map produced: read it, copy it, save it.
 *
 * A screen rather than a tab, and read-only rather than editable — two separate
 * decisions, and both deliberate.
 *
 * **Read-only, permanently.** A feature file is what the map *produced*.
 * Nothing reads one back, because the questions on this board have no Gherkin to
 * be written as and could not be recovered from one. A text box you could type
 * into would promise a way back that does not exist, so this is a `<pre>` and
 * the footer says why.
 *
 * **A screen rather than a tab**, because the `.examplemap` is the document now
 * — it is in the pane beside the board, and it is what you edit. The Gherkin is
 * a second artefact derived from it, wanted at the end of a session rather than
 * throughout one. Giving it half of a pane that otherwise always shows the
 * document would cost the document half its width for something looked at twice
 * an hour.
 *
 * Built on the native `<dialog>`: `showModal()` brings the focus trap, the inert
 * background, the Escape key and the top-layer stacking with it.
 *
 * It has to say `m-auto` to sit in the middle, which is the one thing the
 * native element would have done for nothing. A modal dialog is centred by the
 * UA's `margin: auto`, and Tailwind's preflight zeroes the margin on every
 * element — so this opened hard against the top-left corner until it asked for
 * the centring back. The other two dialogs in doc-em restore the same margins
 * by hand (`mx-auto mt-6 mb-auto`) to hang from the top instead; this one is a
 * thing you read rather than work in, so it takes the middle.
 *
 * ## It is set at the size the source is set at
 *
 * The two are the same text twice: the `.examplemap` in the pane behind this
 * dialog, and what it produced. Somebody who has chosen a size in the source
 * pane has said how big text has to be for them to read it, and that answer
 * does not change when the text changes name — so this takes the setting rather
 * than keeping a number of its own to be discovered as too small.
 *
 * ## It says what it cannot write
 *
 * An open question is not a specification, so Gherkin has no keyword for one. A
 * map with questions still on it produces a feature file quietly missing them,
 * and the count is stated here rather than left to be discovered by diffing the
 * two files. It replaced a `confirm()` that asked you to accept that before you
 * had seen either.
 */

import { useEffect, useRef, useState } from 'react';
import { copyText, downloadText } from '../../lib/files.ts';
import { IconButton } from './IconButton.tsx';

export function GherkinDialog({
	open,
	filename,
	text,
	unwritable,
	textSize,
	onClose,
}: {
	open: boolean;
	filename: string;
	/** The feature file, or null when the map does not currently parse. */
	text: string | null;
	/**
	 * The size the source pane is set in, in px. The feature file is shown at it
	 * — see the note in the header comment.
	 */
	textSize: number;
	/** How many open questions this file cannot express. */
	unwritable: number;
	onClose: () => void;
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');

	useEffect(() => {
		const element = dialog.current;
		if (!element) return;
		if (open && !element.open) element.showModal();
		if (!open && element.open) element.close();
	}, [open]);

	// A dialog reopened later must not still show a checkmark from the last
	// visit, which would read as "already copied".
	useEffect(() => {
		if (!open) setCopied('idle');
	}, [open]);

	const copy = async () => {
		if (text === null) return;
		const done = await copyText(text);
		setCopied(done ? 'done' : 'failed');
		// Long enough to read, short enough that the button is not stuck looking
		// like a checkmark next time it is glanced at.
		if (done) setTimeout(() => setCopied('idle'), 2000);
	};

	return (
		<dialog
			ref={dialog}
			onClose={onClose}
			onCancel={onClose}
			aria-labelledby="gherkin-title"
			className="m-auto w-[min(48rem,94vw)] rounded-2xl border border-slate-200 bg-white p-0 text-ink backdrop:bg-black/40 dark:border-slate-700 dark:bg-night-raised dark:text-slate-100"
		>
			<div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
				<div>
					<h2 id="gherkin-title" className="text-sm font-semibold">
						The feature file this map produced
					</h2>
					<p className="mt-0.5 font-mono text-xs text-ink-muted dark:text-slate-400">{filename}</p>
				</div>
				<div className="flex items-center gap-2">
					<IconButton
						icon={copied === 'done' ? 'check' : 'copy'}
						label={copied === 'done' ? 'Copied' : 'Copy the feature file to the clipboard'}
						onClick={() => void copy()}
						disabled={text === null}
					/>
					<IconButton
						icon="exportFile"
						label="Save the feature file"
						onClick={() => {
							if (text !== null) downloadText(filename, text);
						}}
						disabled={text === null}
					/>
					<IconButton icon="close" label="Close" onClick={onClose} />
				</div>
			</div>

			<div className="max-h-[60vh] overflow-auto px-5 py-4">
				{text === null ? (
					<p className="rounded-lg border border-critical/40 bg-critical/5 p-3 text-sm dark:border-critical/50">
						No feature file: the map does not parse. The problems are listed under the source pane.
					</p>
				) : (
					<pre className="font-mono leading-[1.6] whitespace-pre-wrap" style={{ fontSize: `${textSize}px` }}>
						{text}
					</pre>
				)}
				{copied === 'failed' && (
					<p role="alert" className="mt-3 text-xs text-critical">
						This browser would not let the page write to the clipboard. Select the text and copy it
						by hand.
					</p>
				)}
			</div>

			<div className="border-t border-slate-200 px-5 py-3 text-xs text-ink-muted dark:border-slate-700 dark:text-slate-400">
				{unwritable > 0 && (
					<p className="mb-1 text-warning">
						{unwritable} open {unwritable === 1 ? 'question is' : 'questions are'} not in this file.
						An open question is not a specification, so Gherkin has no keyword for it — the{' '}
						<code>.examplemap</code> keeps them.
					</p>
				)}
				<p>
					Read-only, and permanently so. Nothing reads a feature file back into a board: the
					questions have no Gherkin to be written as, so there is no way back from one.
				</p>
			</div>
		</dialog>
	);
}
