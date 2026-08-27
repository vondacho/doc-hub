/**
 * The problems panel, docked under the source.
 *
 * This replaced `ProblemList`, which could not become it. That one was an alert
 * about a file somebody had just picked: it appeared, it was dismissed, and the
 * board behind it was never touched. Now that the text *is* the board, a problem
 * is a continuous fact about what is on screen — so it lives with the text, it
 * is always there, and clicking one takes you to the line.
 *
 * ba-ddd-mapper's panel, and its rule: **a problem stops the board redrawing.**
 * The last good parse stays up while the text is broken, which is what lets you
 * type a half-finished line without the wall vanishing underneath you.
 */

import type { Problem } from '../../lib/eventstorm/problems.ts';

export function SourceProblems({
	problems,
	stale,
	collapsed,
	onToggle,
	onReveal,
}: {
	problems: readonly Problem[];
	/** Whether the board on screen is older than the text beside it. */
	stale: boolean;
	collapsed: boolean;
	onToggle: () => void;
	onReveal: (line: number) => void;
}) {
	return (
		<div className="border-t border-slate-200 dark:border-slate-700">
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={!collapsed}
				className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs font-semibold transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand motion-reduce:transition-none dark:hover:bg-night-raised"
			>
				<span aria-hidden="true" className="text-ink-muted">
					{collapsed ? '▸' : '▾'}
				</span>
				{problems.length > 0 ? (
					<span className="rounded-full bg-critical/15 px-2 py-0.5 text-critical">
						{problems.length} {problems.length === 1 ? 'problem' : 'problems'}
					</span>
				) : (
					<span className="text-good">No problems</span>
				)}
				{stale && (
					<span className="text-ink-muted dark:text-slate-400">
						The board is the last version that parsed
					</span>
				)}
			</button>

			{!collapsed && problems.length > 0 && (
				<ul className="max-h-52 overflow-y-auto border-t border-slate-200 text-xs dark:border-slate-700">
					{problems.map((problem, index) => (
						<li key={`${problem.line}:${problem.column}:${index}`}>
							<button
								type="button"
								onClick={() => onReveal(problem.line)}
								className="flex w-full gap-3 px-3 py-2 text-left transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand motion-reduce:transition-none dark:hover:bg-night-raised"
							>
								<span className="shrink-0 font-mono text-critical">
									{problem.line}:{problem.column}
								</span>
								<span>
									<span className="text-ink dark:text-slate-200">{problem.message}</span>
									{problem.hint && (
										<span className="mt-0.5 block text-ink-muted dark:text-slate-400">{problem.hint}</span>
									)}
								</span>
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
