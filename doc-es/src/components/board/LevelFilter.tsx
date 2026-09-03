/**
 * The level row: which of the three workshops the wall is being looked at as.
 *
 * It sits beside the tag row and is built like it, because it is the same kind
 * of control — a row of toggles that changes how the wall is *drawn* and
 * nothing about what the file says. Choosing a shallower level turns down the
 * notes its notation does not offer, exactly as choosing a tag turns down the
 * notes that do not wear it, and both go through the one dimming argued beside
 * the dimmed sticky in `BoardGrid`.
 *
 * ## Why it left the legend
 *
 * It lived inside `Legend` while it was a setting *about* the notation: pick a
 * level, and the list of colours underneath grew. That reading stopped being
 * true when the level became a lens. It is now a filter — the same sentence
 * describes it and the tag row — and a filter that renders inside the reference
 * material it happens to resize is in the wrong place twice over: the bar's
 * "legend" switch could take it off screen, and the two controls that do the
 * one job to the wall sat in different parts of the page.
 *
 * So the filters are one row and the legend is the reference under it. What is
 * left in `Legend` is the swatch list, which is the only part of it that was
 * ever reference.
 *
 * ## It is a radiogroup, and the tag row is not
 *
 * A wall is looked at through one level and any number of tags. That is the
 * whole of the difference, and it is why this row's buttons are radios that
 * cannot be turned off while the tag row's are independent toggles with a
 * "show all" beside them. There is no off position here: every wall is being
 * looked at as *something*.
 *
 * ## Never gated, never disabled, and always accounting for itself
 *
 * Not gated by the legend switch: that hides reference text you may already
 * know, and a filter you have turned on is state, not reference — hiding it
 * would leave the wall dimmed with nothing on screen explaining why.
 *
 * No level is ever disabled, either. Coming back up does not take notes away,
 * so there is nothing to protect the visitor from. What the control owes them
 * instead is the *consequence*, and it is owed twice. Each chip's tooltip says
 * what pressing *it* would hold back, for somebody weighing the choice; the
 * count after the row says what the lens in force is holding back right now,
 * whether or not anybody asked. A wall silently missing a third of itself with
 * nothing on screen accounting for it is the failure this replaced a disabled
 * button with.
 */

import { cardLabel, levelLabel, levelMeaning, type Level } from '../../lib/eventstorm/model.ts';
import type { LevelChoice } from '../../lib/board/state.ts';
import { TOOLTIP } from './IconButton.tsx';

export function LevelFilter({
	levels,
	chosen,
	onLevel,
}: {
	/** All three, in order of depth, each with what it would dim. */
	readonly levels: readonly LevelChoice[];
	/** The lens in force. View state held by the island, never a field on the board. */
	readonly chosen: Level;
	readonly onLevel: (level: Level) => void;
}) {
	const dimmed = levels.find((choice) => choice.level === chosen)?.dims ?? 0;

	return (
		<section aria-labelledby="level-filter" className="flex flex-wrap items-center gap-1">
			<h2 id="level-filter" className="sr-only">
				Which level of event storming this is
			</h2>

			<span id="level-filter-label" className="mr-1 text-xs font-semibold text-ink-muted dark:text-slate-400">
				Level
			</span>

			{/* Labelled by the visible word beside it rather than by a second copy
			    of the heading above: an `aria-label` here would have a reader hear
			    "which level of event storming this is" twice in a row, once for the
			    section and once for the group inside it. */}
			<div role="radiogroup" aria-labelledby="level-filter-label" className="flex flex-wrap gap-1">
				{levels.map(({ level, dims, kinds }) => {
					const current = chosen === level;
					const explains =
						dims > 0
							? `${levelMeaning[level]} ${dims} ${dims === 1 ? 'note' : 'notes'} on this wall ${
									dims === 1 ? 'is' : 'are'
								} not part of it and would be dimmed: ${kinds.map((kind) => cardLabel[kind].toLowerCase()).join(', ')}.`
							: levelMeaning[level];
					return (
						<span key={level} className="group relative inline-flex">
							<button
								type="button"
								role="radio"
								aria-checked={current}
								/*
								 * The count is in the accessible name as well as the tooltip,
								 * for the reason the tag chips carry theirs: "big picture,
								 * dims 6 notes" is the whole content of this control, and a
								 * reader given the label alone would be missing the half that
								 * decides whether to press it.
								 */
								aria-label={
									dims > 0 ? `${levelLabel[level]}, dims ${dims} ${dims === 1 ? 'note' : 'notes'}` : levelLabel[level]
								}
								onClick={() => onLevel(level)}
								className={`rounded-full border px-3 py-1 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none ${
									current
										? 'border-ink bg-ink text-white dark:border-slate-200 dark:bg-slate-200 dark:text-ink'
										: 'border-slate-300 text-ink-muted hover:border-brand hover:text-brand dark:border-slate-600 dark:text-slate-400'
								}`}
							>
								{levelLabel[level]}
							</button>

							{/*
							 * The toolbar's tooltip, worn by a chip. `TOOLTIP` is the bar's
							 * own pill, imported rather than copied, so the two never drift.
							 *
							 * It replaced a `title`, which was the wrong control here for
							 * the reason IconButton gives at length: a native tooltip is
							 * mouse-only, and it never appears for the person tabbing along
							 * this row — who is exactly the person who cannot see how much
							 * of the wall a level would take away.
							 *
							 * Two things differ from the bar's, and both follow from the
							 * text rather than from taste. It **wraps**, with a measure,
							 * because this is a sentence and a list of card kinds where the
							 * bar's is two or three words; `whitespace-nowrap` on it would
							 * draw a pill wider than the window. And it is anchored to the
							 * chip's left edge rather than centred under it, because the
							 * row sits against the left margin of the page — a centred box
							 * this wide under the first chip would hang off the edge, which
							 * is a thing the bar's short labels never do.
							 */}
							<span aria-hidden="true" className={`${TOOLTIP} top-full left-0 mt-1.5 w-max max-w-64 leading-snug`}>
								{explains}
							</span>
						</span>
					);
				})}
			</div>

			{/*
			 * The lens's own account of itself, in the place the level was chosen.
			 *
			 * Always mounted and always live, so the arithmetic is announced at the
			 * moment it changes rather than a region appearing with text already in
			 * it — the tag row's rule, and for its reason. Empty when nothing is
			 * dimmed, which is the ordinary state and wants no furniture: the row
			 * above already says which level is in force, and a line of grey text
			 * restating it would be the thing the reader learns to skip, taking the
			 * count with it on the day there is one.
			 *
			 * ## Not made redundant by the chips' tooltips
			 *
			 * They answer different questions, and only one of them is answered
			 * without being asked. A tooltip is *hypothetical and on demand* — what
			 * pressing this level would do, for somebody who went looking. This is
			 * the state the wall is actually in, stated whether or not anybody
			 * hovers anything, which is the only version of the fact that reaches a
			 * reader who has just noticed two thirds of their wall has gone grey.
			 *
			 * It is also the only one a screen reader gets: the tooltips are
			 * `aria-hidden`, and this is a live region. That was the point of it.
			 */}
			<p aria-live="polite" className="ml-2 text-xs text-ink-muted dark:text-slate-400">
				{dimmed > 0
					? `${dimmed} ${dimmed === 1 ? 'note is' : 'notes are'} dimmed.`
					: ''}
			</p>
		</section>
	);
}
