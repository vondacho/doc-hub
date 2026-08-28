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
 * Where it sits is the mapper's, though. A dialog centres itself by default, and
 * a panel that lists documents is read top-down and changes height as the list
 * grows — so `mb-auto` puts it near the top instead, at the mapper's width, as a
 * flex column whose list is the part that scrolls.
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
 * the browser, and if it was never exported it is gone entirely. So the remove
 * control arms itself, and the armed row is the mapper's: it names the file it is
 * about to take, says there is no undo and no copy anywhere else, and offers
 * Cancel beside Remove.
 *
 * An armed row rather than a `confirm()`: a native dialog inside a native modal
 * is a stacking problem in several browsers, and `confirm()` blocks the event
 * loop for a decision one word long.
 *
 * There is no "clear all", and there will not be one. A store that can be
 * emptied from a toolbar is a store that will be emptied from a toolbar, and the
 * only copy of a wall somebody has not exported yet lives here.
 */

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.tsx';
import { IconButton } from './IconButton.tsx';
import type { Inventory, StoredBoard } from '../../lib/storage.ts';

/** What an export of one of these rows is called — the confirm names the file. */
const EXTENSION = '.eventstorm';

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
			className="mx-auto mt-6 mb-auto flex max-h-[calc(100dvh-3rem)] w-[min(42rem,92vw)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-0 text-ink shadow-xl backdrop:bg-slate-900/30 backdrop:backdrop-blur-[1px] dark:border-slate-700 dark:bg-night-raised dark:text-slate-100"
		>
			<div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
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

			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm">
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
								onCancel={() => setArming(null)}
								onDelete={() => {
									onDelete(board.key);
									setArming(null);
								}}
							/>
						))}
					</ul>
				)}
			</div>

			<div className="flex shrink-0 items-start gap-2 border-t border-slate-200 px-4 py-3 text-xs text-ink-muted dark:border-slate-700 dark:text-slate-400">
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
 * A control when there is somewhere to go, a plain item otherwise —
 * ba-ddd-mapper's rule, and its reason: a control that is present and does
 * nothing looks like something that ought to work, and a disabled one looks
 * broken. The row already open is the second case. It used to open anyway, on
 * the argument that reopening the board you are looking at is the one harmless
 * thing this panel can do; true, and beside the point, because the gesture still
 * has no outcome and the way to look at that board is to close this panel.
 *
 * It is marked rather than hidden, because "is what I am looking at the thing
 * that is saved?" is the first question this panel is opened to answer.
 *
 * The remove control is ba-ddd-mapper's too, and for its reason: quiet until the
 * row is under the pointer, and always reachable by keyboard. A delete control
 * at full contrast on every row invites the accident it takes two steps to
 * prevent. Unlike the mapper, the open row keeps it — the mapper can withhold it
 * because its other editor lists the same entry, and this board has no second
 * page to delete from.
 */
function Row({
	board,
	open,
	armed,
	onOpen,
	onArm,
	onCancel,
	onDelete,
}: {
	board: StoredBoard;
	open: boolean;
	armed: boolean;
	onOpen: () => void;
	onArm: () => void;
	onCancel: () => void;
	onDelete: () => void;
}) {
	if (armed) return <Confirm board={board} onCancel={onCancel} onDelete={onDelete} />;

	const shell = 'min-w-0 flex-1 text-left';
	const name = (
		<>
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
		</>
	);

	return (
		<li
			className={`group/row flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
				open
					? 'border-brand/40 bg-brand/5'
					: 'border-transparent hover:border-slate-200 dark:hover:border-slate-700'
			}`}
		>
			{open ? (
				<span className={shell}>{name}</span>
			) : (
				<button
					type="button"
					onClick={onOpen}
					className={`${shell} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand`}
				>
					{name}
				</button>
			)}

			<button
				type="button"
				onClick={onArm}
				aria-label={`Remove ${board.key}${EXTENSION} from this browser`}
				className="shrink-0 rounded px-1.5 py-0.5 text-xs text-ink-muted opacity-0 group-hover/row:opacity-100 hover:bg-rose-50 hover:text-rose-700 focus:opacity-100 dark:text-slate-400 dark:hover:bg-rose-950 dark:hover:text-rose-300"
			>
				Remove
			</button>
		</li>
	);
}

/**
 * The armed row: what is about to go, in full, before it goes.
 *
 * The file named rather than "this board", because after this there is no undo.
 * The store is not a filesystem: nothing goes to a trash. Cancel is a real
 * control rather than a click elsewhere — an armed delete that can only be
 * stood down by guessing where to click is one that gets pressed.
 */
function Confirm({
	board,
	onCancel,
	onDelete,
}: {
	board: StoredBoard;
	onCancel: () => void;
	onDelete: () => void;
}) {
	return (
		<li className="rounded-md border border-rose-300 bg-rose-50 px-2 py-1.5 dark:border-rose-800 dark:bg-rose-950">
			<p className="text-xs">
				Remove{' '}
				<strong>
					{board.key}
					{EXTENSION}
				</strong>{' '}
				from this browser? There is no undo, and no copy anywhere else unless you have exported
				it.
			</p>
			<div className="mt-1.5 flex gap-2">
				<button
					type="button"
					onClick={onDelete}
					className="rounded-md bg-rose-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-rose-700"
				>
					Remove
				</button>
				<button
					type="button"
					onClick={onCancel}
					className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold hover:bg-white dark:border-slate-600 dark:hover:bg-slate-800"
				>
					Cancel
				</button>
			</div>
		</li>
	);
}

function size(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	return `${(bytes / 1024).toFixed(1)} kB`;
}
