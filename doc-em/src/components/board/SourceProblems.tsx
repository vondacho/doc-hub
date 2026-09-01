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
 * type a half-finished line without the board vanishing underneath you.
 *
 * ## Why the type size is here
 *
 * This bar is the source pane's only furniture, and the type size is a property
 * of the pane rather than of the board. It is deliberately not in the toolbar
 * beside the board's zoom: those controls are grouped under "how the board is
 * being looked at", and a second percentage next to the first would be two
 * magnifications with nothing on screen saying which is which. Here it sits on
 * the thing it changes.
 */

import type { Problem } from '../../lib/examplemap/problems.ts';
import { DEFAULT_TEXT_SIZE, TEXT_SIZES } from './Editor.tsx';

export function SourceProblems({
	problems,
	stale,
	collapsed,
	onToggle,
	onReveal,
	textSize,
	onTextSize,
}: {
	problems: readonly Problem[];
	/** Whether the board on screen is older than the text beside it. */
	stale: boolean;
	collapsed: boolean;
	onToggle: () => void;
	onReveal: (line: number) => void;
	/** The size the source is set in, in px. */
	textSize: number;
	onTextSize: (px: number) => void;
}) {
	return (
		<div className="border-t border-slate-200 dark:border-slate-700">
			{/* One row, two controls. The toggle takes the width it had — a target
			    that shrank when a second control appeared beside it would be a
			    worse toggle — and the type size sits at the end. */}
			<div className="flex items-center">
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={!collapsed}
				className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left text-xs font-semibold transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand motion-reduce:transition-none dark:hover:bg-night-raised"
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
					<span className="truncate text-ink-muted dark:text-slate-400">
						The board is the last version that parsed
					</span>
				)}
			</button>

			<TextSize size={textSize} onSize={onTextSize} />
			</div>

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

/**
 * Smaller, the current size, bigger.
 *
 * Shaped like the board's zoom control — two steppers with the value between
 * them, and the value is the reset — because it is the same kind of control and
 * somebody who has found one should not have to learn the other. The two A's
 * are drawn at the ends of the scale rather than labelled "smaller" and
 * "bigger": the glyph is the demonstration, and the accessible name says the
 * words for anybody who is not looking at it.
 *
 * The ends disable rather than wrap. A stepper that jumps from the largest back
 * to the smallest is one press away from losing the setting somebody needed.
 */
function TextSize({ size, onSize }: { size: number; onSize: (px: number) => void }) {
	const index = TEXT_SIZES.indexOf(size as (typeof TEXT_SIZES)[number]);
	// A size restored from an older scale is still a size: step from where it
	// sits rather than refusing to move until it is reset.
	const smaller = [...TEXT_SIZES].reverse().find((px) => px < size);
	const bigger = TEXT_SIZES.find((px) => px > size);

	const step =
		'rounded-full px-1.5 py-1 leading-none text-ink-muted transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-40 disabled:hover:text-ink-muted motion-reduce:transition-none dark:text-slate-400 dark:hover:text-sky-400 dark:disabled:hover:text-slate-400';

	return (
		<div className="flex shrink-0 items-center gap-0.5 pr-2 pl-1">
			<button
				type="button"
				onClick={() => smaller !== undefined && onSize(smaller)}
				disabled={smaller === undefined}
				aria-label="Smaller source text"
				className={`${step} text-[11px] font-semibold`}
			>
				A
			</button>
			<button
				type="button"
				onClick={() => onSize(DEFAULT_TEXT_SIZE)}
				aria-label={`The source is ${size} pixels${
					index === -1 ? '' : `, size ${index + 1} of ${TEXT_SIZES.length}`
				}. Reset to ${DEFAULT_TEXT_SIZE} pixels.`}
				className={`${step} w-10 text-center text-xs font-semibold tabular-nums`}
			>
				{size}px
			</button>
			<button
				type="button"
				onClick={() => bigger !== undefined && onSize(bigger)}
				disabled={bigger === undefined}
				aria-label="Bigger source text"
				className={`${step} text-[17px] font-semibold`}
			>
				A
			</button>
		</div>
	);
}
