/**
 * What this board would export — the `.eventstorm` file, editable.
 *
 * Worth having because the file is the actual artefact: it is what gets
 * committed and reviewed, and without this the only way to see it is to download
 * it.
 *
 * Built on the native `<dialog>` element rather than a div with a high z-index.
 * `showModal()` brings the focus trap, the inert background, the Escape key and
 * the top-layer stacking with it — all of which would otherwise be hand-written,
 * and three of which are usually hand-written wrong.
 *
 * ## One pane, where doc-em has two
 *
 * doc-em shows the map beside the Gherkin it produces, because an example map
 * has two artefacts and one of them is a one-way door. An event storm has one:
 * the wall. Its output is a shared picture and a set of seams, and what the
 * workshop leads to — a C4 model, a set of registered events, a story map — is
 * built in another tool by a person, not generated from here.
 *
 * So there is one pane and it is a text box. Every line of an event storm is
 * text somebody typed, so applying the text replaces the board, and for some
 * changes that is plainly the better way in: renaming eight events is a
 * find-and-replace here and sixteen clicks out there.
 *
 * ## The text is a snapshot, not a live view
 *
 * It is the board as it was when the dialog opened. Nothing behind a modal can
 * change while it is up, so a live view would be re-rendering to no purpose —
 * and it would fight the person typing.
 */

import { useEffect, useRef, useState } from 'react';
import type { Problem } from '../../lib/eventstorm/problems.ts';
import { Icon } from './Icon.tsx';
import { IconButton } from './IconButton.tsx';
import { ProblemList } from './ProblemList.tsx';

/** Empty when the text parsed and the board was replaced. */
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
	const [draft, setDraft] = useState(text);
	const [problems, setProblems] = useState<readonly Problem[]>([]);
	const [copied, setCopied] = useState<'idle' | 'done' | 'manual'>('idle');

	useEffect(() => {
		const element = dialog.current;
		if (!element) return;
		if (open && !element.open) element.showModal();
		if (!open && element.open) element.close();
	}, [open]);

	// A fresh open shows the board as it is now, not the draft from last time.
	useEffect(() => {
		if (open) {
			setDraft(text);
			setProblems([]);
			setCopied('idle');
		}
	}, [open, text]);

	const apply = () => {
		const found = onApply(draft);
		setProblems(found);
		if (found.length === 0) onClose();
	};

	const copy = () => {
		// `navigator.clipboard` is unavailable on an insecure origin and can be
		// refused outright. Saying "select it and copy" is more use than a button
		// that silently did nothing.
		navigator.clipboard?.writeText(draft).then(
			() => setCopied('done'),
			() => setCopied('manual'),
		);
	};

	return (
		<dialog
			ref={dialog}
			onClose={onClose}
			onCancel={onClose}
			aria-labelledby="preview-title"
			className="w-[min(52rem,94vw)] rounded-2xl border border-slate-200 bg-white p-0 text-ink backdrop:bg-black/40 dark:border-slate-700 dark:bg-night-raised dark:text-slate-100"
		>
			<div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-700">
				<h2 id="preview-title" className="font-mono text-sm font-semibold">
					{filename}
				</h2>
				<div className="flex items-center gap-1">
					<IconButton icon="copy" label="Copy the file to the clipboard" onClick={copy} />
					<IconButton icon="apply" label="Apply this text to the board" onClick={apply} tone="primary" />
					<IconButton icon="close" label="Close" onClick={onClose} />
				</div>
			</div>

			<div className="px-5 py-4">
				<label className="sr-only" htmlFor="preview-text">
					The .eventstorm file
				</label>
				<textarea
					id="preview-text"
					value={draft}
					spellCheck={false}
					onChange={(event) => setDraft(event.target.value)}
					className="h-[52vh] w-full resize-none rounded-xl border border-slate-200 bg-white p-3 font-mono text-xs leading-relaxed text-ink focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-brand dark:border-slate-700 dark:bg-black/30 dark:text-slate-100"
				/>

				{problems.length > 0 && (
					<div className="mt-3">
						<ProblemList problems={problems} />
					</div>
				)}

				<p className="mt-3 flex items-center gap-2 text-xs text-ink-muted dark:text-slate-400" aria-live="polite">
					<Icon name="preview" className="h-4 w-4 shrink-0" aria-hidden="true" />
					{copied === 'done'
						? 'Copied.'
						: copied === 'manual'
							? 'This browser would not let the page copy. Select the text and copy it.'
							: 'Editing here and applying replaces the board. Undo brings the old one back.'}
				</p>
			</div>
		</dialog>
	);
}
