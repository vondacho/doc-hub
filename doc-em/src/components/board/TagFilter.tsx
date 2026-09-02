/**
 * The tag row: every label on the wall, and which of them the board is pointing
 * at.
 *
 * A row of toggles rather than a search box or a dropdown — the person who
 * most needs to know a map has tags on it is the one who did not put them
 * there, and they will not type a word they have never seen into a box to find
 * out. The row states the vocabulary and is the control at the same time.
 *
 * ## The whole row disappears when the map has no tags
 *
 * Not an empty row, not a placeholder. A board nobody has tagged is the
 * ordinary state of a session that has just started, and a permanent strip of
 * furniture advertising a feature that has nothing to act on is exactly the
 * noise this board spends its whole design avoiding.
 *
 * ## Why dimming, and not hiding
 *
 * Argued where it is enforced — see `Card`'s note on `dimmed` — but the short
 * of it: a map is read as a whole, and the red cards are the output. A filter
 * that removed cards would quietly answer "are there open questions here?" with
 * a map that no longer had any on it. The board leaves the map intact and turns
 * everything else down. `filtered` in state.ts carries the other half: a hit
 * lights the rule above it, so an answer is never found under a greyed-out
 * heading.
 *
 * ## The count is a live region
 *
 * Because dimming is a visual signal and this board's rule is that colour is
 * never the only one. A screen reader gets the arithmetic — "9 of 41 cards" —
 * at the moment it changes, and every dimmed card says so in its own
 * accessible name besides.
 */

import type { TagInUse } from '../../lib/board/state.ts';

export function TagFilter({
	tags,
	chosen,
	onToggle,
	onClear,
	matching,
	total,
}: {
	readonly tags: readonly TagInUse[];
	/** The `tagKey`s currently on. Empty means the filter is off. */
	readonly chosen: ReadonlySet<string>;
	readonly onToggle: (key: string) => void;
	readonly onClear: () => void;
	/** How many cards the filter is pointing at. Only read when it is on. */
	readonly matching: number;
	readonly total: number;
}) {
	if (tags.length === 0) return null;
	const on = chosen.size > 0;

	return (
		<section aria-labelledby="tag-filter" className="flex flex-wrap items-center gap-1">
			<h2 id="tag-filter" className="sr-only">
				Filter the map by tag
			</h2>

			<span className="mr-1 text-xs font-semibold text-ink-muted dark:text-slate-400">Tags</span>

			{tags.map(({ tag, key, count }) => {
				const picked = chosen.has(key);
				return (
					<button
						key={key}
						type="button"
						aria-pressed={picked}
						/*
						 * The count is in the accessible name rather than only in the
						 * superscript beside the word, because "legal, 9 cards" is the
						 * whole content of this control and a reader that got "legal"
						 * alone would be missing the half that decides whether it is
						 * worth pressing.
						 */
						aria-label={`${tag}, ${count} ${count === 1 ? 'card' : 'cards'}`}
						onClick={() => onToggle(key)}
						className={`rounded-full border px-2 py-0.5 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none ${
							picked
								? 'border-ink bg-ink text-white dark:border-slate-200 dark:bg-slate-200 dark:text-ink'
								: 'border-slate-300 text-ink-muted hover:border-brand hover:text-brand dark:border-slate-600 dark:text-slate-400'
						}`}
					>
						{tag}
						<span aria-hidden="true" className="ml-1 opacity-60">
							{count}
						</span>
					</button>
				);
			})}

			{on && (
				<button
					type="button"
					onClick={onClear}
					className="ml-1 rounded-full px-2 py-0.5 text-xs font-semibold text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand dark:text-sky-400"
				>
					Show all
				</button>
			)}

			{/*
			 * Always mounted, so the region is in the accessibility tree before it
			 * has anything to say. A live region added to the page at the moment
			 * its text changes is not reliably announced.
			 */}
			<p aria-live="polite" className="ml-2 text-xs text-ink-muted dark:text-slate-400">
				{on ? `${matching} of ${total} ${total === 1 ? 'card' : 'cards'}` : ''}
			</p>
		</section>
	);
}
