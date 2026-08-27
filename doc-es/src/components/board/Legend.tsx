/**
 * The notation, and the choice of which notation.
 *
 * Event storming is three workshops, not one, and each adds colours to the one
 * before it. So this area does two jobs that belong together: it says which
 * workshop this is, and it shows what that workshop's notation *is*. Choosing a
 * deeper level makes the legend longer, which is the honest way to present a
 * cumulative notation — the new colours appear beneath the ones already there,
 * rather than replacing a diagram.
 *
 * ## Why the legend moved into the island
 *
 * doc-sm and doc-em render their legends on the server: their notations are
 * fixed, so the markup is the same for every visitor and there is nothing to
 * hydrate. This one depends on a setting the visitor changes, so it has to live
 * where that setting does. The page keeps a `<noscript>` copy of the big-picture
 * five, which is the level a storm is at unless somebody says otherwise.
 *
 * ## The toggle hides the colours, not the choice
 *
 * The bar can turn this legend off, as ba-ddd-mapper's can. What it turns off is
 * the swatch list — the reference text somebody who knows event storming does
 * not need on screen. The level control stays: it is the setting that decides
 * what this board *is*, and a switch labelled "legend" that also took away the
 * only way back to Big Picture would be a trap.
 *
 * ## A level that would orphan notes is disabled, not hidden
 *
 * Going deeper is always allowed. Coming back up is not, once the wall carries
 * notes the shallower notation has no colour for — the file could not express
 * that board, and the board must not hold a state the file cannot. The control
 * says so, and says how many notes are in the way, because a disabled control
 * with no explanation is indistinguishable from a bug.
 */

import { kindsFor, cardLabel, cardMeaning, LEVELS, levelLabel, levelMeaning, type Level } from '../../lib/eventstorm/model.ts';
import { swatchClass } from '../../lib/board/kinds.ts';
import { orphanedBy } from '../../lib/board/gestures.ts';
import type { BoardState } from '../../lib/board/state.ts';

export function Legend({
	board,
	shown,
	onLevel,
}: {
	board: BoardState;
	/**
	 * Whether the colours are showing.
	 *
	 * It gates the swatches and **not** the level control above them. Turning a
	 * legend off is a claim about reference text — that you already know the
	 * notation — and the choice of which workshop this is would be the one thing
	 * in here that a visitor could no longer reach.
	 */
	shown: boolean;
	onLevel: (level: Level) => void;
}) {
	const kinds = kindsFor(board.level);

	return (
		<section aria-labelledby="legend" className="flex flex-col gap-3">
			<h2 id="legend" className="sr-only">
				The notation, and which level of event storming this is
			</h2>

			<div
				role="radiogroup"
				aria-label="Which level of event storming this is"
				className="flex flex-wrap items-center gap-1"
			>
				{LEVELS.map((level) => {
					const orphans = orphanedBy(board, level);
					const blocked = orphans.length > 0;
					const current = board.level === level;
					return (
						<button
							key={level}
							type="button"
							role="radio"
							aria-checked={current}
							disabled={blocked && !current}
							title={
								blocked && !current
									? `${orphans.length} ${orphans.length === 1 ? 'note is' : 'notes are'} not part of ${levelLabel[
											level
										].toLowerCase()}: ${[...new Set(orphans.map((card) => cardLabel[card.kind].toLowerCase()))].join(', ')}.`
									: levelMeaning[level]
							}
							onClick={() => onLevel(level)}
							className={`rounded-full border px-3 py-1 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none ${
								current
									? 'border-ink bg-ink text-white dark:border-slate-200 dark:bg-slate-200 dark:text-ink'
									: 'border-slate-300 text-ink-muted hover:border-brand hover:text-brand dark:border-slate-600 dark:text-slate-400'
							}`}
						>
							{levelLabel[level]}
						</button>
					);
				})}
				<p className="ml-2 text-xs text-ink-muted dark:text-slate-400">{levelMeaning[board.level]}</p>
			</div>

			{/*
			 * Announced, because the list growing is the feedback that the level
			 * changed — the notation gaining three colours is a more useful thing to
			 * hear than "process modelling selected".
			 */}
			{shown && (
			<ul aria-live="polite" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
				{kinds.map((kind) => (
					<li key={kind} className="flex items-center gap-2">
						<span className={`inline-block h-3.5 w-3.5 rounded-sm border ${swatchClass[kind]}`} aria-hidden="true" />
						<span className="font-semibold">{cardLabel[kind]}</span>
						<span className="text-ink-muted dark:text-slate-400">{cardMeaning[kind]}</span>
					</li>
				))}
			</ul>
			)}
		</section>
	);
}
