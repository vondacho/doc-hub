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
 */

import { readMap } from '../../lib/board/reading.ts';
import type { BoardState } from '../../lib/board/state.ts';

const TONE = {
	stop: 'border-question-edge bg-question/40 dark:bg-question-night/60',
	watch: 'border-story-edge bg-story/40 dark:bg-story-night/60',
	good: 'border-example-edge bg-example/40 dark:bg-example-night/60',
} as const;

export function Readings({ board }: { board: BoardState }) {
	const readings = readMap(board);
	if (readings.length === 0) return null;

	return (
		<section aria-labelledby="readings" className="flex flex-col gap-2">
			<h2 id="readings" className="sr-only">
				What the map is telling you
			</h2>
			{/* Announced, because a reading appearing is the point: somebody asks a
			    question, and the board says the story is no longer estimable. */}
			<ul aria-live="polite" className="flex flex-wrap gap-2">
				{readings.map((reading) => (
					<li
						key={reading.title}
						className={`max-w-prose rounded-xl border px-3 py-2 text-sm ${TONE[reading.tone]}`}
					>
						<strong className="font-semibold">{reading.title}</strong>
						<span className="block text-ink-muted dark:text-slate-300">{reading.detail}</span>
					</li>
				))}
			</ul>
		</section>
	);
}
