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
 * six — the only level a server can name, since the level is read off cards the
 * page has not parsed.
 *
 * ## The toggle hides the colours, not the choice
 *
 * The bar can turn this legend off, as ba-ddd-mapper's can. What it turns off is
 * the swatch list — the reference text somebody who knows event storming does
 * not need on screen. The level control stays: it is the setting that decides
 * what this board *is*, and a switch labelled "legend" that also took away the
 * only way back to Big Picture would be a trap.
 *
 * ## The level is a lens, so every level is always reachable
 *
 * Going deeper adds colours. Coming back up does not take notes away — it turns
 * down the ones the shallower notation does not offer, exactly as the tag row
 * turns down the ones it is not pointing at. That is what makes a storm modelled
 * to software design showable to a room as a big picture without a second file,
 * and it is argued once beside `Level` in the document model.
 *
 * So no level is ever disabled. What the control owes the reader instead is the
 * *consequence*: how many notes this lens is holding back, and which level shows
 * the wall entire. A wall silently missing a third of itself with no line of
 * text accounting for it is the failure this replaced a disabled button with.
 */

import { kindsFor, cardLabel, cardMeaning, LEVELS, levelLabel, levelMeaning, type Level } from '../../lib/eventstorm/model.ts';
import { swatchClass } from '../../lib/board/kinds.ts';
import { deepestLevel, outsideLevel, type BoardState } from '../../lib/board/state.ts';

export function Legend({
	board,
	level: chosen,
	shown,
	onLevel,
}: {
	board: BoardState;
	/**
	 * The lens in force — view state held by the island, not a field on the
	 * board. It stopped being written into the file; see `Level`.
	 *
	 * Bound as `chosen` inside, so the `LEVELS.map` below can call its own
	 * parameter `level` without shadowing the one in force.
	 */
	level: Level;
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
	const kinds = kindsFor(chosen);

	// What the lens is holding back, and the way back to the whole wall. Both are
	// read from the cards rather than from the level, so a storm that never went
	// deeper says nothing at all here.
	const dimmed = outsideLevel(board, chosen);
	const whole = deepestLevel(board);

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
					const hides = outsideLevel(board, level);
					const current = chosen === level;
					return (
						<button
							key={level}
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
								hides.length > 0
									? `${levelLabel[level]}, dims ${hides.length} ${hides.length === 1 ? 'note' : 'notes'}`
									: levelLabel[level]
							}
							title={
								hides.length > 0
									? `${levelMeaning[level]} ${hides.length} ${hides.length === 1 ? 'note' : 'notes'} on this wall ${
											hides.length === 1 ? 'is' : 'are'
										} not part of it and would be dimmed: ${[
											...new Set(hides.map((card) => cardLabel[card.kind].toLowerCase())),
										].join(', ')}.`
									: levelMeaning[level]
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
					);
				})}
				{/*
				 * The lens's own account of itself, in the place the level was chosen.
				 *
				 * Always mounted and always live, so the arithmetic is announced at the
				 * moment it changes rather than a region appearing with text already in
				 * it — the tag row's rule, and for its reason. It replaces the meaning
				 * of the current level rather than sitting beside it: once notes are
				 * being held back, *how many* and *where they went* is the more urgent
				 * of the two sentences, and two lines of small grey text competing here
				 * would mean neither is read.
				 */}
				<p aria-live="polite" className="ml-2 text-xs text-ink-muted dark:text-slate-400">
					{dimmed.length > 0
						? `${dimmed.length} ${dimmed.length === 1 ? 'note is' : 'notes are'} dimmed. ${levelLabel[whole]} shows the whole wall.`
						: levelMeaning[chosen]}
				</p>
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
