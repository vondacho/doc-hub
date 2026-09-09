/**
 * Where this wall goes — one dialog, several destinations, one press.
 *
 * The toolbar has one Export button and it now opens this rather than writing a
 * file. That is the whole point: the number of things a wall can usefully
 * become is only going to grow, and each one added as its own toolbar button
 * makes the toolbar longer, the common gesture harder to aim at, and the
 * difference between the buttons harder to explain — a 36px square cannot say
 * "this is the one you paste into a slide".
 *
 * A row can. Every destination here carries its name, its extension and a
 * sentence about when to reach for it, which is the information somebody
 * actually needs and the information the old arrangement had nowhere to put.
 *
 * ## Checkboxes, and one Export
 *
 * Rather than a row per file that downloads on click. The reason is that the
 * wants genuinely combine: the picture goes in the deck, the outline goes in
 * the ticket, the `.eventstorm` is the copy that survives a cleared browser,
 * and somebody finishing a workshop wants all three. Ticking three boxes and
 * pressing once is one decision; clicking three rows in a dialog that stays
 * open is three, and it leaves you to work out whether it is finished.
 *
 * ## Two groups, because two of the rows are not about this wall
 *
 * The notation and the doctrine are reference documents: constant text, the
 * same bytes from any board, meant to be handed to an agent working on a storm
 * in a repository nowhere near this tab. They live under Export because that is
 * where somebody goes when they want a file out of here, and they are fenced
 * off under their own heading because a flat list of six would invite reading
 * "Outline" and "Doctrine" as two renderings of the same storm.
 *
 * The ticks survive closing the dialog, because this component stays mounted —
 * the same person exports the same set of things every time, and being asked to
 * rebuild the selection on every export is the kind of small tax that makes a
 * feature go unused.
 *
 * ## The shell is StoreState's
 *
 * A native `<dialog>` opened with `showModal()`, for the reasons argued at
 * length there: the focus trap, the inert background, Escape, and top-layer
 * stacking all arrive with it, and three of those four are usually hand-written
 * wrong. Same width, same placement, so the two panels the board can put up
 * read as one family.
 */

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.tsx';
import { IconButton } from './IconButton.tsx';
import { DESTINATIONS, type DestinationId, type Group } from '../../lib/board/export.ts';

/** Ticked when nothing else has been said. The one file that is not a rendering. */
const INITIAL: readonly DestinationId[] = ['source'];

/**
 * The two halves of the list, and what to call them.
 *
 * The copy is here rather than beside the destinations because it is a caption
 * on a panel: the catalogue's job is to know that a destination is reference
 * material, and this file's job is to explain that to somebody reading it for
 * the first time.
 *
 * The second heading has a sentence under it and the first does not, on
 * purpose. "This wall" needs no explanation in a dialog opened from a wall.
 * "The practice" is a genuinely surprising thing to find under an Export
 * button, and somebody who does not read the line will tick it expecting a
 * document about the storm they are looking at.
 */
const GROUPS: readonly { group: Group; title: string; blurb: string | null }[] = [
	{ group: 'wall', title: 'This wall', blurb: null },
	{
		group: 'reference',
		title: 'The practice',
		blurb:
			'Not about this storm. Instructions to hand a coding agent working on an .eventstorm file somewhere else — the same text this board’s own assistant is given.',
	},
];

export function ExportDialog({
	open,
	dark,
	filtered,
	onExport,
	onClose,
}: {
	open: boolean;
	/** The board's theme, so the rows can say which one the picture will be in. */
	dark: boolean;
	/**
	 * How many notes the lens is turning down, or `null` when nothing is filtered.
	 *
	 * A count rather than a boolean, because "only what is showing" is a choice
	 * nobody can make well without knowing what it costs. Six of forty is a
	 * different decision from thirty-nine of forty, and the checkbox that does
	 * not say which is a checkbox people tick and then regret.
	 */
	filtered: { hidden: number; total: number } | null;
	/** Runs the selection. Resolves when every file has been handed over. */
	onExport: (picks: readonly DestinationId[], onlyShowing: boolean) => Promise<void>;
	onClose: () => void;
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	const [picked, setPicked] = useState<ReadonlySet<DestinationId>>(new Set(INITIAL));
	const [onlyShowing, setOnlyShowing] = useState(false);
	const [running, setRunning] = useState(false);
	const [failed, setFailed] = useState<string | null>(null);

	useEffect(() => {
		const element = dialog.current;
		if (!element) return;
		if (open && !element.open) element.showModal();
		if (!open && element.open) element.close();
	}, [open]);

	/*
	 * A failure from the last run must not greet the next opening.
	 *
	 * The selection deliberately survives — see the note at the top — but an
	 * error does not: it is about one attempt, and a red line above a dialog
	 * that has not done anything yet reads as a tool that is broken rather than
	 * as a thing that went wrong once.
	 */
	useEffect(() => {
		if (open) setFailed(null);
	}, [open]);

	/*
	 * A filter that has been cleared clears the narrowing with it.
	 *
	 * Otherwise the tick stays on, invisibly, against a lens that no longer
	 * exists — and the next export would either silently ignore it or, worse,
	 * pick it up again the moment somebody filters for something unrelated.
	 */
	useEffect(() => {
		if (filtered === null) setOnlyShowing(false);
	}, [filtered]);

	const toggle = (id: DestinationId) =>
		setPicked((was) => {
			const next = new Set(was);
			if (!next.delete(id)) next.add(id);
			return next;
		});

	const chosen = DESTINATIONS.filter((entry) => picked.has(entry.id));
	const narrowed = onlyShowing && filtered !== null && chosen.some((entry) => entry.lensApplies);

	const run = async () => {
		setRunning(true);
		setFailed(null);
		try {
			await onExport(chosen.map((entry) => entry.id), onlyShowing);
			onClose();
		} catch (error) {
			// Named, and left on screen. An export that quietly produced nothing
			// is the failure this dialog most has to avoid: the visitor believes
			// the wall is on disk, and it is not.
			setFailed(error instanceof Error ? error.message : 'The export did not finish.');
		} finally {
			setRunning(false);
		}
	};

	return (
		<dialog
			ref={dialog}
			onClose={onClose}
			onCancel={onClose}
			aria-labelledby="export-title"
			className="mx-auto mt-6 mb-auto flex max-h-[calc(100dvh-3rem)] w-[min(42rem,92vw)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-0 text-ink shadow-xl backdrop:bg-slate-900/30 backdrop:backdrop-blur-[1px] dark:border-slate-700 dark:bg-night-raised dark:text-slate-100"
		>
			<div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
				<div>
					<p className="font-mono text-[10px] tracking-[0.14em] text-ink-muted uppercase dark:text-slate-400">
						export
					</p>
					<h2 id="export-title" className="font-semibold">
						What should leave this tab?
					</h2>
				</div>
				<IconButton icon="close" label="Close" onClick={onClose} />
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
				{GROUPS.map(({ group, title, blurb }) => (
					<section key={group} className="mb-1 last:mb-0">
						<h3 className="px-3 pt-2 pb-1 font-mono text-[10px] tracking-[0.14em] text-ink-muted uppercase dark:text-slate-400">
							{title}
						</h3>
						{blurb !== null && (
							<p className="px-3 pb-2 text-sm text-ink-muted dark:text-slate-400">{blurb}</p>
						)}
						<ul className="flex flex-col gap-1">
							{DESTINATIONS.filter((entry) => entry.group === group).map((entry) => (
								<li key={entry.id}>
									{/* The whole row is the control. A checkbox with a five-word
									    label beside a sentence that is not part of it is a target
									    the size of a fingernail, and the sentence is the half
									    somebody is reading when they decide to tick it. */}
									<label
										className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors motion-reduce:transition-none ${
											picked.has(entry.id)
												? 'border-brand/40 bg-brand/5'
												: 'border-transparent hover:border-slate-200 dark:hover:border-slate-700'
										}`}
									>
										<input
											type="checkbox"
											checked={picked.has(entry.id)}
											// Frozen while the run is in flight. The selection is
											// read once, at the press; a tick changed after that
											// would put the list on screen out of step with the
											// files arriving in the downloads folder.
											disabled={running}
											onChange={() => toggle(entry.id)}
											className="mt-1 h-4 w-4 shrink-0 accent-brand"
										/>
										<Icon
											name={entry.icon}
											className="mt-0.5 h-5 w-5 shrink-0 text-ink-muted dark:text-slate-400"
										/>
										<span className="min-w-0 flex-1">
											<span className="flex flex-wrap items-baseline gap-x-2">
												<span className="font-semibold">{entry.label}</span>
												<code className="font-mono text-xs text-ink-muted dark:text-slate-400">
													{entry.extension}
												</code>
												{/* Which theme a picture will come out in is decided
												    by the board, not by this dialog, and it is not
												    recoverable from the file afterwards — so it is
												    said here rather than discovered in the downloads
												    folder. */}
												{entry.themed && (
													<span className="text-xs text-ink-muted dark:text-slate-400">
														{dark ? 'dark' : 'light'}
													</span>
												)}
											</span>
											<span className="mt-0.5 block text-sm text-ink-muted dark:text-slate-400">
												{entry.what}
											</span>
										</span>
									</label>
								</li>
							))}
						</ul>
					</section>
				))}

				{/*
				 * The lens, as one tick under the list rather than one per row.
				 *
				 * It is a property of the *view*, not of any one file — the same
				 * answer applies to every destination that can honour it — and a
				 * copy of it on three rows would be three things to keep in step
				 * and three chances to leave one of them disagreeing.
				 */}
				<div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
					<label
						className={`flex items-start gap-3 rounded-lg px-3 py-2 ${
							filtered === null ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
						}`}
					>
						<input
							type="checkbox"
							checked={onlyShowing && filtered !== null}
							disabled={filtered === null || running}
							onChange={(event) => setOnlyShowing(event.target.checked)}
							className="mt-1 h-4 w-4 shrink-0 accent-brand"
						/>
						<span className="min-w-0 flex-1">
							<span className="font-semibold">Only what the board is showing</span>
							<span className="mt-0.5 block text-sm text-ink-muted dark:text-slate-400">
								{filtered === null
									? 'Nothing is filtered — the level and the tag row are both showing every note.'
									: `The pictures and the outline leave out the ${filtered.hidden} of ${filtered.total} ${
											filtered.total === 1 ? 'note' : 'notes'
										} the lens is turning down. The source file always carries the whole storm.`}
							</span>
						</span>
					</label>
				</div>

				{failed !== null && (
					<p role="alert" className="mt-3 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-critical dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
						{failed}
					</p>
				)}
			</div>

			<div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
				<p className="text-xs text-ink-muted dark:text-slate-400" aria-live="polite">
					{/* The permission prompt is only mentioned when it can actually
					    appear. A warning about saving "several" files above a
					    selection of one is a warning that teaches people to stop
					    reading this line. */}
					{chosen.length === 0
						? 'Nothing selected.'
						: `${chosen.length} ${chosen.length === 1 ? 'file' : 'files'}${
								narrowed ? ', narrowed to what is showing' : ''
							}.${chosen.length > 1 ? ' Your browser may ask once before saving several.' : ''}`}
				</p>
				<div className="flex gap-2">
					<button
						type="button"
						onClick={onClose}
						className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand dark:border-slate-600 dark:hover:bg-slate-800"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={() => void run()}
						disabled={chosen.length === 0 || running}
						className="rounded-md bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
					>
						{running ? 'Exporting…' : 'Export'}
					</button>
				</div>
			</div>
		</dialog>
	);
}
