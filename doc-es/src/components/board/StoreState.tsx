/**
 * What this browser is holding, in one panel.
 *
 * ba-ddd-mapper's store panel, brought across — and grown out of what was
 * `OpenDialog`, rather than added beside it. Two panels listing the same entries
 * is the duplication this alignment work exists to remove, and the old one was
 * already doing most of this job: it listed the saved boards, it opened one, and
 * it deleted one with the two-step confirm kept below.
 *
 * What it gained from the mapper is the *accounting*. Autosave is silent by
 * design — it has to be, or it would interrupt every second — and the price of
 * that silence is a visitor who cannot say what is in their own browser. So the
 * heading says how many boards and how much space, every row carries its size,
 * and the footer says plainly that none of it is a backup.
 *
 * What it kept from doc-hub is the shell. This is a native `<dialog>`:
 * `showModal()` brings the focus trap, the inert background, the Escape key and
 * the top-layer stacking with it — all of which the mapper's panel hand-writes
 * as a positioned div, and three of which are usually hand-written wrong. The
 * better of the two shells won.
 *
 * ## The rows are titles, not slugs
 *
 * A storage key is a slug made from the product and the title, which is the
 * right thing for a key and a poor thing to read: `client-onboarding_ordering-a-pizza`
 * is recognisable only if you already know what you are looking for. Each row
 * leads with the storm's own title, read straight out of the stored text, and
 * keeps the key underneath as the thing that is actually stored.
 *
 * ## Deleting asks first, and says what is lost
 *
 * Everything else on this board is undoable. This is not: the entry is gone from
 * the browser, and if it was never exported it is gone entirely. So the delete
 * control arms itself and the second click is the one that acts, with the label
 * naming the board.
 *
 * A second click rather than a `confirm()`: a native dialog inside a native
 * modal is a stacking problem in several browsers, and `confirm()` blocks the
 * event loop for a decision one word long.
 *
 * There is no "clear all", and there will not be one. A store that can be
 * emptied from a toolbar is a store that will be emptied from a toolbar, and the
 * only copy of a wall somebody has not exported yet lives here.
 */

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.tsx';
import { IconButton } from './IconButton.tsx';
import type { Inventory, StoredBoard } from '../../lib/storage.ts';

export function StoreState({
	open,
	state,
	current,
	onOpen,
	onDelete,
	onClose,
}: {
	open: boolean;
	/** Read when the panel opens — see the board. A stale list is worse than none. */
	state: Inventory;
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
			aria-labelledby="store-title"
			className="w-[min(38rem,92vw)] rounded-2xl border border-slate-200 bg-white p-0 text-ink backdrop:bg-black/40 dark:border-slate-700 dark:bg-night-raised dark:text-slate-100"
		>
			<div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
				<div>
					<p className="font-mono text-[10px] tracking-[0.14em] text-ink-muted uppercase dark:text-slate-400">
						this browser
					</p>
					<h2 id="store-title" className="font-semibold">
						{state.boards.length} {state.boards.length === 1 ? 'board' : 'boards'} · {size(state.bytes)}
					</h2>
				</div>
				<IconButton icon="close" label="Close" onClick={onClose} />
			</div>

			<div className="max-h-[60vh] overflow-y-auto px-5 py-4">
				{state.boards.length === 0 ? (
					<p className="text-sm text-ink-muted dark:text-slate-400">
						Nothing is saved yet. The board saves itself a second after you change it, under a name
						made from its product and its title.
					</p>
				) : (
					<ul className="flex flex-col gap-1">
						{state.boards.map((board) => (
							<Row
								key={board.key}
								board={board}
								open={board.key === current}
								armed={arming === board.key}
								onOpen={() => onOpen(board.key)}
								onArm={() => setArming(board.key)}
								onDelete={() => {
									onDelete(board.key);
									setArming(null);
								}}
							/>
						))}
					</ul>
				)}
			</div>

			<div className="flex items-start gap-2 border-t border-slate-200 px-5 py-3 text-xs text-ink-muted dark:border-slate-700 dark:text-slate-400">
				<Icon name="exportFile" className="mt-0.5 h-4 w-4 shrink-0" />
				<p>
					Nothing here is a backup. These live in this browser only — not on a server, and not on
					your other machines — and a browser clears its storage without asking. Export writes the{' '}
					<code>.eventstorm</code> file to disk, which is the copy that survives.
				</p>
			</div>
		</dialog>
	);
}

/**
 * One board, as a row.
 *
 * The row that is already open still opens — it is the one entry you cannot
 * lose by opening it, and a control that does nothing would be stranger than one
 * that does the harmless thing. It is marked rather than hidden, because "is
 * what I am looking at the thing that is saved?" is the first question this
 * panel is opened to answer.
 */
function Row({
	board,
	open,
	armed,
	onOpen,
	onArm,
	onDelete,
}: {
	board: StoredBoard;
	open: boolean;
	armed: boolean;
	onOpen: () => void;
	onArm: () => void;
	onDelete: () => void;
}) {
	return (
		<li
			className={`group/row flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
				open
					? 'border-brand/40 bg-brand/5'
					: 'border-transparent hover:border-slate-200 dark:hover:border-slate-700'
			}`}
		>
			<button
				type="button"
				onClick={onOpen}
				className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
			>
				<span className="flex flex-wrap items-baseline gap-x-2">
					<span className="truncate font-semibold">
						{/* A stored entry with no readable title is the one row somebody
						    opens this panel to find. Named as such rather than left blank,
						    which would read as a rendering fault. */}
						{board.title ?? <span className="text-warning">unreadable — no title line</span>}
					</span>
					{open && (
						<span className="text-xs font-semibold text-brand dark:text-sky-400">open now</span>
					)}
				</span>
				<span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 font-mono text-xs text-ink-muted dark:text-slate-400">
					<span className="truncate">{board.key}</span>
					<span>{size(board.bytes)}</span>
				</span>
			</button>

			{armed ? (
				<button
					type="button"
					onClick={onDelete}
					className="shrink-0 rounded-full border border-slate-300 px-2 py-0.5 text-xs font-semibold text-critical hover:border-critical focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand dark:border-slate-600"
				>
					Delete {board.key} from this browser?
				</button>
			) : (
				<IconButton
					icon="trash"
					label={`Delete ${board.key} from this browser`}
					size="sm"
					tone="danger"
					onClick={onArm}
				/>
			)}
		</li>
	);
}

function size(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	return `${(bytes / 1024).toFixed(1)} kB`;
}
