/**
 * The notation: a swatch, a name and a sentence for each colour on offer.
 *
 * Reference material, and only that. The choice of *which* notation — the level
 * the wall is being looked at through — used to live here too, and moved out to
 * `LevelFilter` when it became a lens rather than a setting about the legend.
 * That file argues the move; what it leaves behind is this list, which is the
 * part of the old component that was ever reference.
 *
 * The list still grows and shrinks with the level, because a cumulative
 * notation is honestly presented by getting longer: the new colours appear
 * beneath the ones already there rather than replacing a diagram. It just does
 * not own the control that does it any more.
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
 * ## What the bar's switch turns off
 *
 * Exactly this, and nothing else. Turning a legend off is a claim about
 * reference text — that you already know the notation — and it must not reach
 * the filters above it: a switch labelled "legend" that also took away the way
 * back to Big Picture would be a trap, and one that hid the row explaining why
 * two thirds of the wall is grey would be worse.
 */

import { kindsFor, cardLabel, cardMeaning, type Level } from '../../lib/eventstorm/model.ts';
import { swatchClass } from '../../lib/board/kinds.ts';

export function Legend({
	level,
	shown,
}: {
	/** The lens in force: this lists the kinds it offers, and no others. */
	readonly level: Level;
	readonly shown: boolean;
}) {
	if (!shown) return null;

	return (
		<section aria-labelledby="legend">
			<h2 id="legend" className="sr-only">
				What the colours mean
			</h2>

			{/*
			 * Announced, because the list growing is the feedback that the level
			 * changed — the notation gaining three colours is a more useful thing to
			 * hear than "process modelling selected".
			 */}
			<ul aria-live="polite" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
				{kindsFor(level).map((kind) => (
					<li key={kind} className="flex items-center gap-2">
						<span className={`inline-block h-3.5 w-3.5 rounded-sm border ${swatchClass[kind]}`} aria-hidden="true" />
						<span className="font-semibold">{cardLabel[kind]}</span>
						<span className="text-ink-muted dark:text-slate-400">{cardMeaning[kind]}</span>
					</li>
				))}
			</ul>
		</section>
	);
}
