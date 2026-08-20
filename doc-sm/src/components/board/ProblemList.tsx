/**
 * What was wrong with the file that was just picked.
 *
 * Rendered instead of a thrown-away error, and rendered *alongside* the board
 * the visitor already had — a failed import never touches the current map. An
 * import that also wiped an hour of workshop would be the worst bug this tool
 * could have, so the reducer is not even reached unless the parse succeeded.
 *
 * `role="alert"` matches the treatment doc-portal gives its registry-outage
 * panel: this is a thing that just happened and needs reading now.
 */

import type { Problem } from '../../lib/storymap/problems.ts';

export function ProblemList({
	problems,
	onDismiss,
	subject = 'That file',
}: {
	problems: readonly Problem[];
	onDismiss: () => void;
	/** What was wrong — a picked file, or text edited in the preview. */
	subject?: string;
}) {
	if (problems.length === 0) return null;

	return (
		<div
			role="alert"
			className="rounded-2xl border border-critical/40 bg-critical/5 p-4 text-sm dark:border-critical/50"
		>
			<div className="flex items-start justify-between gap-4">
				<h2 className="font-semibold">
					{problems.length === 1 ? `${subject} has a problem` : `${subject} has ${problems.length} problems`}
				</h2>
				<button
					type="button"
					onClick={onDismiss}
					className="rounded-sm px-2 py-0.5 text-xs text-ink-muted hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand dark:text-slate-400 dark:hover:text-sky-400"
				>
					Dismiss
				</button>
			</div>
			<p className="mt-1 text-ink-muted dark:text-slate-400">
				The board on this page has not been changed.
			</p>
			<ul className="mt-3 flex flex-col gap-2">
				{problems.map((problem, index) => (
					<li key={`${problem.line}-${problem.column}-${index}`} className="font-mono text-xs">
						<span className="text-ink-muted dark:text-slate-400">
							{problem.line}:{problem.column}
						</span>{' '}
						{problem.message}
						{problem.hint && (
							<span className="mt-0.5 block pl-8 font-sans text-ink-muted dark:text-slate-400">{problem.hint}</span>
						)}
					</li>
				))}
			</ul>
		</div>
	);
}
