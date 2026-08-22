/**
 * How each card kind looks, and what it is called.
 *
 * The four colours are not a design choice. They are the technique: yellow
 * story, blue rule, green example, red question, as Matt Wynne defined it and as
 * every printed template and every wall of sticky notes uses them. Somebody who
 * has run a session before must recognise this board without being told, so
 * these are the one part of doc-em that is not open to taste.
 *
 * Written out in full and never assembled. Tailwind scans source text for class
 * names and cannot see one built at runtime, so `bg-${kind}` would compile, run,
 * and produce four transparent cards — a failure with no error attached.
 *
 * Colour is never the only signal. Every card names its kind in its accessible
 * name, and the board carries a legend that says what each colour holds.
 */

import type { CardKind } from '../examplemap/model.ts';

export const cardClass: Record<CardKind, string> = {
	story:
		'bg-story border-story-edge text-ink dark:bg-story-night dark:border-story-night-edge dark:text-slate-100',
	rule: 'bg-rule border-rule-edge text-ink dark:bg-rule-night dark:border-rule-night-edge dark:text-slate-100',
	example:
		'bg-example border-example-edge text-ink dark:bg-example-night dark:border-example-night-edge dark:text-slate-100',
	question:
		'bg-question border-question-edge text-ink dark:bg-question-night dark:border-question-night-edge dark:text-slate-100',
};

/** The legend swatch. Same colours, no text, so it is written out too. */
export const swatchClass: Record<CardKind, string> = {
	story: 'bg-story border-story-edge dark:bg-story-night dark:border-story-night-edge',
	rule: 'bg-rule border-rule-edge dark:bg-rule-night dark:border-rule-night-edge',
	example: 'bg-example border-example-edge dark:bg-example-night dark:border-example-night-edge',
	question: 'bg-question border-question-edge dark:bg-question-night dark:border-question-night-edge',
};
