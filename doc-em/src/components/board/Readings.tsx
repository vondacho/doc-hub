/**
 * What the shape of the map is telling you.
 *
 * The practice says to read the finished map *before* anyone discusses it —
 * many red cards and the story is not ready, many blue and it is too big, a rule
 * with no green and nobody understands it. Counting cards is the one part of the
 * technique a tool can genuinely do, and doing it live is worth more than doing
 * it at the end, because the counts change while the conversation is still in
 * the room.
 *
 * Each reading names what it saw. A tool that said "not ready" without saying
 * why would just be another opinion in the room, and the room can already
 * generate those.
 *
 * ## One line, and only the reason is highlighted
 *
 * These used to be `rounded-xl` cards laid out side by side, each with its title
 * bold on one line and its detail on the next. Two of them is the ordinary case
 * — the sample has exactly two — and two such cards is a block of furniture
 * above a board that has to compete with them for the screen. A reading is a
 * remark about the map, not a panel of its own. So: one line each, `text-xs`.
 *
 * The tint went with the card. A full-width coloured strip — ba-ddd-mapper's
 * note, which is where this shape came from — is the right weight for something
 * that just happened and wants answering. A reading is neither: it is standing
 * commentary that is *usually* on screen, and two permanent coloured bands above
 * the board are louder than the board. What earns the colour is the reason
 * itself, so the reason wears it and nothing else does: `Not ready to estimate`
 * in rose, and the count that explains it in ordinary muted text beside it.
 *
 * Rose for stop and amber for watch, which is the trade this made. The card
 * colours these used to borrow (red question, blue story, green example) tied a
 * reading to the cards it had counted, and that tie is gone; what replaced it is
 * a reading that reads as what it is, a warning about the map, in the colours
 * this tool warns in.
 *
 * No dismiss control, unlike the mapper's note. A note there is an event —
 * something happened, you read it, it goes — and a reading is a standing fact
 * about what is on the board. Dismissing one would be a lie that lasted until
 * the next card was dropped.
 */

import { readMap } from '../../lib/board/reading.ts';
import type { BoardState } from '../../lib/board/state.ts';

const TONE = {
	stop: 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200',
	watch: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
	good: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
} as const;

export function Readings({ board }: { board: BoardState }) {
	const readings = readMap(board);
	if (readings.length === 0) return null;

	return (
		<section aria-labelledby="readings">
			<h2 id="readings" className="sr-only">
				What the map is telling you
			</h2>
			{/* Announced, because a reading appearing is the point: somebody asks a
			    question, and the board says the story is no longer estimable. */}
			<ul aria-live="polite" className="flex flex-col gap-1">
				{readings.map((reading) => (
					<li key={reading.title} className="flex flex-wrap items-baseline gap-x-2 text-xs">
						<strong className={`rounded px-1.5 py-0.5 font-semibold ${TONE[reading.tone]}`}>
							{reading.title}
						</strong>
						<span className="text-ink-muted dark:text-slate-400">{reading.detail}</span>
					</li>
				))}
			</ul>
		</section>
	);
}
