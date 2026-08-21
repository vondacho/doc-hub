/**
 * The ticket and status line under a story's title.
 *
 * Two rules, both of them the user's:
 *
 * **An empty id is not shown.** A story with no ticket shows no ticket badge at
 * all — not a placeholder, not a dash. Until the ticketing system has heard of
 * it there is nothing true to display, and an empty slot on eighty cards is
 * eighty pieces of noise.
 *
 * **The status is always shown**, defaulting to Open. Unlike the id it always
 * has a value, and a story map where you cannot see what is in flight is missing
 * the thing people came to look at.
 *
 * ## Why the status badge is not coloured
 *
 * global.css reserves four colours for status — `good`, `warning`, `serious`,
 * `critical` — and says in as many words that nothing else may borrow them.
 * Those four mean *health*; a workflow state is not health, and a "Done" tinted
 * `--color-good` would quietly make every real status on a page unreadable.
 *
 * Nor is a seventh, eighth and ninth hue invented for this. A story map's
 * primary encoding is already colour — magenta, blue, yellow for the card kinds
 * — and stacking a second colour system on top of it would wreck the first. So
 * the status is a word, with weight and fill doing the small work of separating
 * work-in-flight from work that is finished.
 */

import { storyStatusLabel, type StoryStatus } from '../../lib/storymap/model.ts';

/**
 * Monochrome, and deliberately so — see the note above. `in-progress` is the one
 * state that earns emphasis, because it is the one a standing team looks for.
 */
const STATUS_CLASS: Record<StoryStatus, string> = {
	open: 'border-slate-400/60 text-ink-muted dark:border-slate-500 dark:text-slate-400',
	analysing: 'border-slate-400/60 text-ink-muted dark:border-slate-500 dark:text-slate-400',
	ready: 'border-ink/40 text-ink dark:border-slate-300 dark:text-slate-200',
	'in-progress': 'border-ink bg-ink text-white dark:border-slate-200 dark:bg-slate-200 dark:text-ink',
	done: 'border-transparent bg-ink/10 text-ink-muted dark:bg-white/15 dark:text-slate-400',
	closed: 'border-transparent bg-ink/10 text-ink-muted line-through dark:bg-white/15 dark:text-slate-400',
};

export function StoryMeta({
	ticket,
	status,
	onEditTicket,
}: {
	ticket: string | null;
	status: StoryStatus;
	onEditTicket: () => void;
}) {
	return (
		<div className="mt-[0.3em] flex flex-wrap items-center gap-[0.3em]">
			{ticket !== null && (
				<button
					type="button"
					onClick={onEditTicket}
					aria-label={`Ticket ${ticket}. Change or remove the link.`}
					className="rounded-sm px-[0.15em] font-mono text-[0.72em] text-ink-muted underline decoration-dotted underline-offset-2 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand dark:text-slate-400 dark:hover:text-sky-400"
				>
					{ticket}
				</button>
			)}
			<span
				className={`rounded-full border px-[0.4em] py-px text-[0.66em] font-semibold whitespace-nowrap ${STATUS_CLASS[status]}`}
			>
				{storyStatusLabel[status]}
			</span>
		</div>
	);
}
