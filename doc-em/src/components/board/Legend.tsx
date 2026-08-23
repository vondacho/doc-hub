/**
 * The notation, shown with the board rather than above it.
 *
 * It used to sit in the page, between the header and the board. That put a block
 * of reference text between the reader and the first control, so the product
 * picker — the thing that says what this board is *about* — was the third thing
 * down rather than the first. doc-es moved its legend under the toolbar for the
 * same reason and this follows it, so all three boards read alike.
 *
 * Static, unlike doc-es's: an example map has four kinds and always will. It is a component only so that it can live
 * inside the island and therefore under the toolbar; the page keeps a copy for
 * `<noscript>`, which is the only reader that will never see this one.
 *
 * The legend is not decoration. Colour is kind on this board, and the rule that
 * governs doc-portal's status palette governs these too: colour is never the
 * only signal. This says in words what the fills say in hue, and every card
 * repeats it in its accessible name.
 */

import { CARD_KINDS, cardLabel, cardMeaning } from '../../lib/examplemap/model.ts';
import { swatchClass } from '../../lib/board/kinds.ts';

export function Legend() {
	return (
		<section aria-labelledby="legend" className="flex flex-col gap-2">
			<h2 id="legend" className="sr-only">
				What the colours mean
			</h2>
			<ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
				{CARD_KINDS.map((kind) => (
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
