/**
 * The boards this browser is keeping, and what you can do with them.
 *
 * Built on the native `<dialog>` element, for the reason PreviewDialog gives:
 * `showModal()` brings the focus trap, the inert background, the Escape key and
 * the top-layer stacking with it — all of which would otherwise be hand-written,
 * and three of which are usually hand-written wrong.
 *
 * ## Deleting asks first, and says what is lost
 *
 * Everything else on this board is undoable. This is not: the entry is gone from
 * the browser, and if it was never exported it is gone entirely. So the delete
 * control arms itself first and the second click is the one that acts, with the
 * label saying which board and that the file on disk is unaffected.
 *
 * A second click rather than a `confirm()`: a native dialog inside a native
 * modal is a stacking problem in several browsers, and `confirm()` blocks the
 * event loop for a decision that is one word long.
 *
 * The armed control is the one thing here tinted `--color-critical`, which
 * global.css otherwise reserves for status. That is not a new exception: it is
 * IconButton's own `danger` tone, which borrows the same colour for the same
 * reason, held for longer because an armed control has to stay distinct after
 * the pointer moves off it. Colour is not the only signal either — the label
 * spells out what will be deleted.
 *
 * ## Opening a board replaces the one on screen
 *
 * Which is why the current board's own entry is marked rather than hidden. It is
 * the one you cannot lose by opening it, and knowing which row that is stops the
 * list reading as "some boards, and one mystery".
 */

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.tsx';
import { IconButton } from './IconButton.tsx';

export function OpenDialog({
	open,
	keys,
	current,
	onOpen,
	onDelete,
	onClose,
}: {
	open: boolean;
	/** Saved board keys, already sorted. See `saved()` in src/lib/storage.ts. */
	keys: readonly string[];
	/** The key the board on screen is under, so its row can say so. */
	current: string;
	onOpen: (key: string) => void;
	onDelete: (key: string) => void;
	onClose: () => void;
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	const [arming, setArming] = useState<string | null>(null);

	useEffect(() => {
		const element = dialog.current;
		if (!element) return;
		if (open && !element.open) element.showModal();
		if (!open && element.open) element.close();
	}, [open]);

	// A board deleted while the confirm was armed, or a dialog reopened later,
	// must not come back still armed — that would put a live delete under the
	// pointer of somebody who has not read the row yet.
	useEffect(() => {
		if (!open) setArming(null);
	}, [open]);

	return (
		<dialog
			ref={dialog}
			onClose={onClose}
			onCancel={onClose}
			aria-labelledby="open-dialog-title"
			className="w-[min(34rem,92vw)] rounded-2xl border border-slate-200 bg-white p-0 text-ink backdrop:bg-black/40 dark:border-slate-700 dark:bg-night-raised dark:text-slate-100"
		>
			<div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-700">
				<h2 id="open-dialog-title" className="font-semibold">
					Saved in this browser
				</h2>
				<IconButton icon="close" label="Close" onClick={onClose} />
			</div>

			<div className="max-h-[60vh] overflow-y-auto px-5 py-4">
				{keys.length === 0 ? (
					<p className="text-sm text-ink-muted dark:text-slate-400">
						Nothing is saved yet. The board saves itself a second after you change it, under a name
						made from its product and its title.
					</p>
				) : (
					<ul className="flex flex-col gap-1">
						{keys.map((key) => (
							<li
								key={key}
								className="flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 hover:border-slate-200 dark:hover:border-slate-700"
							>
								<button
									type="button"
									onClick={() => onOpen(key)}
									className="min-w-0 flex-1 truncate text-left font-mono text-sm hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand dark:hover:text-sky-400"
								>
									{key}
								</button>

								{key === current && (
									<span className="shrink-0 text-xs font-semibold text-ink-muted dark:text-slate-400">
										open now
									</span>
								)}

								{arming === key ? (
									<button
										type="button"
										onClick={() => {
											onDelete(key);
											setArming(null);
										}}
										className="shrink-0 rounded-full border border-slate-300 px-2 py-0.5 text-xs font-semibold text-critical hover:border-critical focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand dark:border-slate-600"
									>
										Delete {key} from this browser?
									</button>
								) : (
									<IconButton
										icon="trash"
										label={`Delete ${key} from this browser`}
										size="sm"
										tone="danger"
										onClick={() => setArming(key)}
									/>
								)}
							</li>
						))}
					</ul>
				)}
			</div>

			<div className="flex items-center gap-2 border-t border-slate-200 px-5 py-3 text-xs text-ink-muted dark:border-slate-700 dark:text-slate-400">
				<Icon name="importFile" className="h-4 w-4 shrink-0" aria-hidden="true" />
				<p>
					These live in this browser only — not on a server, and not on your other machines. The
					file you export is still the map.
				</p>
			</div>
		</dialog>
	);
}
