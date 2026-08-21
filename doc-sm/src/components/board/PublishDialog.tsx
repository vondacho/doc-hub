/**
 * Raising tickets for every unbound story on the board.
 *
 * This is the one control in doc-sm that changes something outside doc-sm, and
 * it is the only one that cannot be undone. Everything else here is a file and a
 * browser tab: a bad drag is one Ctrl+Z, a bad import leaves the board alone, a
 * bad export writes a file nobody has to keep. Publishing writes rows into
 * somebody else's database, and undo cannot reach them — the board's history
 * would happily roll back the ticket *ids* while forty real tickets stayed
 * exactly where they were, which is worse than not offering undo at all.
 *
 * ## Confirmed twice, on purpose
 *
 * Two steps, and they are deliberately different in kind rather than the same
 * question asked again. Two identical "are you sure?" prompts train a person to
 * click through both.
 *
 *   1. **Review.** Every story that would get a ticket, listed by name, with the
 *      space they land in. This is the step that catches the real mistake, which
 *      is not mis-clicking — it is publishing the right board into the wrong
 *      space, or publishing forty stories when you meant four.
 *   2. **Commit.** Type the space name. A deliberate act that cannot be produced
 *      by a stray Return on a focused button, and one that re-reads the single
 *      most consequential field on the way past.
 *
 * The primary button is not focused on either step, so no keyboard default can
 * carry someone through.
 */

import { useEffect, useRef, useState } from 'react';
import type { Story } from '../../lib/board/state.ts';
import { IconButton } from './IconButton.tsx';

export interface PublishProgress {
	readonly done: number;
	readonly total: number;
	/** Stories that could not be raised, with the reason each one failed. */
	readonly failures: readonly { title: string; error: string }[];
	readonly running: boolean;
}

export function PublishDialog({
	open,
	space,
	stories,
	progress,
	onPublish,
	onClose,
}: {
	open: boolean;
	space: string;
	stories: readonly Story[];
	progress: PublishProgress | null;
	onPublish: () => void;
	onClose: () => void;
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	const [step, setStep] = useState<'review' | 'commit'>('review');
	const [typed, setTyped] = useState('');

	useEffect(() => {
		const element = dialog.current;
		if (!element) return;
		if (open && !element.open) element.showModal();
		if (!open && element.open) element.close();
	}, [open]);

	useEffect(() => {
		if (!open) return;
		setStep('review');
		setTyped('');
	}, [open]);

	useEffect(() => {
		const element = dialog.current;
		if (!element) return;
		const closed = () => onClose();
		element.addEventListener('close', closed);
		return () => element.removeEventListener('close', closed);
	}, [onClose]);

	const running = progress?.running === true;
	const finished = progress !== null && !progress.running;
	const confirmed = typed.trim() === space;

	return (
		// No display utility on the <dialog> — see the note in PreviewDialog.tsx
		// and the guard rule in global.css.
		<dialog
			ref={dialog}
			aria-labelledby="publish-title"
			className="m-auto w-[min(40rem,92vw)] rounded-2xl border border-slate-200 bg-white p-0 text-ink backdrop:bg-black/50 dark:border-slate-700 dark:bg-night-raised dark:text-slate-100"
		>
			<div className="flex max-h-[85vh] flex-col">
				<div className="flex items-baseline justify-between gap-4 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
					<h2 id="publish-title" className="text-sm font-semibold">
						{finished ? 'Published' : `Publish ${stories.length} ${stories.length === 1 ? 'story' : 'stories'} to ${space}`}
					</h2>
					<IconButton icon="close" label="Close" onClick={onClose} disabled={running} />
				</div>

				{finished ? (
					<Report progress={progress} space={space} />
				) : step === 'review' ? (
					<>
						<div className="px-5 py-4 text-sm">
							<p>
								Each of these has no ticket yet. Publishing raises one for each, in the space{' '}
								<code className="font-mono font-semibold">{space}</code>.
							</p>
							<p className="mt-2 text-ink-muted dark:text-slate-400">
								Tickets are created in another system. Nothing here can take them back — not undo, not
								closing this tab, not re-importing the file.
							</p>
						</div>
						<ul className="max-h-[45vh] overflow-auto border-y border-slate-200 px-5 py-3 text-sm dark:border-slate-700">
							{stories.map((story) => (
								<li key={story.id} className="flex items-baseline gap-2 py-0.5">
									<span aria-hidden="true" className="text-ink-muted dark:text-slate-500">
										&#8226;
									</span>
									<span className="break-words">{story.title}</span>
								</li>
							))}
						</ul>
						<div className="flex justify-end gap-2 px-5 py-3">
							<Secondary onClick={onClose}>Cancel</Secondary>
							<Primary onClick={() => setStep('commit')}>Review done — continue</Primary>
						</div>
					</>
				) : (
					<>
						<div className="px-5 py-4 text-sm">
							<p>
								This will create <strong>{stories.length}</strong>{' '}
								{stories.length === 1 ? 'ticket' : 'tickets'} in{' '}
								<code className="font-mono font-semibold">{space}</code>, and cannot be undone.
							</p>
							<label htmlFor="publish-confirm" className="mt-4 block text-ink-muted dark:text-slate-400">
								Type <code className="font-mono font-semibold text-ink dark:text-slate-100">{space}</code> to
								confirm.
							</label>
							<input
								id="publish-confirm"
								value={typed}
								autoComplete="off"
								disabled={running}
								onChange={(event) => setTyped(event.target.value)}
								className="mt-1.5 w-full rounded-lg border border-slate-300 bg-transparent px-2 py-1.5 font-mono text-sm focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-brand dark:border-slate-600"
							/>
							{running && (
								<p aria-live="polite" className="mt-3 text-ink-muted dark:text-slate-400">
									Raising {progress.done + 1} of {progress.total}…
								</p>
							)}
						</div>
						<div className="flex justify-end gap-2 px-5 py-3">
							<Secondary onClick={() => setStep('review')} disabled={running}>
								Back
							</Secondary>
							<Primary onClick={onPublish} disabled={!confirmed || running} danger>
								{running ? 'Publishing…' : `Publish ${stories.length}`}
							</Primary>
						</div>
					</>
				)}
			</div>
		</dialog>
	);
}

function Report({ progress, space }: { progress: PublishProgress; space: string }) {
	const created = progress.done - progress.failures.length;
	return (
		<>
			<div className="px-5 py-4 text-sm">
				<p aria-live="polite">
					{created} of {progress.total} raised in <code className="font-mono font-semibold">{space}</code>.
				</p>
				{progress.failures.length > 0 && (
					<p className="mt-2 text-ink-muted dark:text-slate-400">
						The rest are untouched and still unlinked. Publishing again will retry only those — the
						ones that succeeded now have tickets and are skipped.
					</p>
				)}
			</div>
			{progress.failures.length > 0 && (
				<ul className="max-h-[45vh] overflow-auto border-t border-slate-200 px-5 py-3 text-sm dark:border-slate-700">
					{progress.failures.map((failure, index) => (
						<li key={`${failure.title}-${index}`} className="py-1">
							<span className="font-semibold">{failure.title}</span>
							<span className="block text-xs text-ink-muted dark:text-slate-400">{failure.error}</span>
						</li>
					))}
				</ul>
			)}
		</>
	);
}

function Primary({
	onClick,
	disabled = false,
	danger = false,
	children,
}: {
	onClick: () => void;
	disabled?: boolean;
	danger?: boolean;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={`rounded-full px-4 py-1.5 text-sm font-semibold text-white transition focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none ${
				danger ? 'bg-critical hover:brightness-110' : 'bg-brand hover:bg-brand-strong'
			}`}
		>
			{children}
		</button>
	);
}

function Secondary({
	onClick,
	disabled = false,
	children,
}: {
	onClick: () => void;
	disabled?: boolean;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className="rounded-full border border-slate-300 px-4 py-1.5 text-sm font-semibold transition hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none dark:border-slate-600 dark:hover:border-sky-400 dark:hover:text-sky-400"
		>
			{children}
		</button>
	);
}
