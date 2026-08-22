/**
 * How each card kind looks, and what it is called.
 *
 * The five colours are not a design choice. They are the technique: orange
 * domain event, yellow actor, magenta external system, red hotspot, green
 * opportunity, as Alberto Brandolini defined it and as every wall of sticky
 * notes uses them. Somebody who has stood at one of these walls must recognise
 * this board without being told, so these are the one part of doc-es that is not
 * open to taste.
 *
 * Written out in full and never assembled. Tailwind scans source text for class
 * names and cannot see one built at runtime, so `bg-${kind}` would compile, run,
 * and produce five transparent cards — a failure with no error attached.
 *
 * Colour is never the only signal. Every card names its kind in its accessible
 * name, and the board carries a legend that says what each colour holds.
 */

import type { CardKind } from '../eventstorm/model.ts';

export const cardClass: Record<CardKind, string> = {
	event:
		'bg-event border-event-edge text-ink dark:bg-event-night dark:border-event-night-edge dark:text-slate-100',
	actor:
		'bg-actor border-actor-edge text-ink dark:bg-actor-night dark:border-actor-night-edge dark:text-slate-100',
	system:
		'bg-system border-system-edge text-ink dark:bg-system-night dark:border-system-night-edge dark:text-slate-100',
	hotspot:
		'bg-hotspot border-hotspot-edge text-ink dark:bg-hotspot-night dark:border-hotspot-night-edge dark:text-slate-100',
	opportunity:
		'bg-opportunity border-opportunity-edge text-ink dark:bg-opportunity-night dark:border-opportunity-night-edge dark:text-slate-100',
};

/** The legend swatch, and the tint on each `+`. Same colours, so also written out. */
export const swatchClass: Record<CardKind, string> = {
	event: 'bg-event border-event-edge dark:bg-event-night dark:border-event-night-edge',
	actor: 'bg-actor border-actor-edge dark:bg-actor-night dark:border-actor-night-edge',
	system: 'bg-system border-system-edge dark:bg-system-night dark:border-system-night-edge',
	hotspot: 'bg-hotspot border-hotspot-edge dark:bg-hotspot-night dark:border-hotspot-night-edge',
	opportunity:
		'bg-opportunity border-opportunity-edge dark:bg-opportunity-night dark:border-opportunity-night-edge',
};
