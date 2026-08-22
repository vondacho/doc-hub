/**
 * The ticket and status line under the story's title.
 *
 * doc-sm's component, with one difference that is the whole point of it here:
 * **the ticket id is not a button.** There it opens an editor; here it is text.
 *
 * ## Why the id is read-only on the board
 *
 * An example mapping session refines a story. It does not re-address one. The id
 * says which ticket a whole map of rules, examples and questions belongs to, and
 * a mistyped one silently points all of it at somebody else's work — a mistake
 * with no symptom on the board and no obvious moment of discovery.
 *
 * So changing it is an edit to the `.examplemap` file, which is deliberate,
 * reviewable, and shows up in a diff next to the rules it re-homes. The board
 * shows the id because a session needs to know which story it is in; it will not
 * let anybody retype it.
 *
 * The status is the opposite case and is editable from both. It is the field a
 * session actually changes — a map whose rules are agreed and whose questions
 * are answered is what "ready" means — so it is one click on the card menu.
 *
 * ## The two display rules, both from doc-sm
 *
 * **An empty id is not shown.** A story with no ticket shows no badge at all —
 * not a placeholder, not a dash. Until the ticketing system has heard of it
 * there is nothing true to display.
 *
 * **The status is always shown**, defaulting to Open. Unlike the id it always
 * has a value.
 *
 * ## Why the status badge is not coloured
 *
 * global.css reserves four colours for status — `good`, `warning`, `serious`,
 * `critical` — and says in as many words that nothing else may borrow them.
 * Those four mean *health*; a workflow state is not health, and a "Done" tinted
 * `--color-good` would quietly make every real status on a page unreadable.
 *
 * Nor is a fifth hue invented for this. This board's primary encoding is already
 * colour — the four card kinds *are* the notation — and stacking a second colour
 * system on top of it would wreck the first. So the status is a word, with
 * weight and fill doing the small work of separating work in flight from work
 * that is finished.
 */

import { storyStatusLabel, type StoryStatus } from '../../lib/examplemap/model.ts';

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

export function StoryMeta({ ticket, status }: { ticket: string | null; status: StoryStatus }) {
	return (
		<div className="mt-[0.3em] flex flex-wrap items-center gap-[0.3em]">
			{ticket !== null && (
				/*
				 * A span, not a button. The accessible name says why rather than
				 * leaving a keyboard user to discover that nothing here is
				 * focusable — "read-only" on its own reads as a fault, and this is
				 * a decision.
				 */
				<span
					aria-label={`Ticket ${ticket}. Set in the .examplemap file, not on the board.`}
					className="px-[0.15em] font-mono text-[0.72em] text-ink-muted dark:text-slate-400"
				>
					{ticket}
				</span>
			)}
			<span
				className={`rounded-full border px-[0.4em] py-px text-[0.66em] font-semibold whitespace-nowrap ${STATUS_CLASS[status]}`}
			>
				{storyStatusLabel[status]}
			</span>
		</div>
	);
}
