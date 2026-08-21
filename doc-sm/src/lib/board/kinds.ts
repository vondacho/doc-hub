/**
 * How each card kind looks, and what it is called.
 *
 * The class strings are written out in full, one per kind, and never assembled.
 * doc-portal's src/components/home/SectionPanels.astro documents the trap this
 * avoids:
 *
 *   Tailwind scans the source for class names and cannot see one assembled at
 *   runtime, so `lg:grid-cols-${n}` would emit no CSS.
 *
 * The same applies here. `bg-${kind}` would compile, run, and produce three
 * transparent cards — a failure with no error attached to it.
 *
 * The labels are not decoration either. Colour is kind in doc-sm, and the rule
 * that travels with the reserved status palette travels with these too: colour
 * is never the only signal. `label` goes into each card's accessible name, so a
 * screen reader and a reader who cannot separate magenta, blue and yellow both
 * get the same information the fill carries.
 */

import type { CardKind } from './state.ts';

export const KIND_ORDER: readonly CardKind[] = ['activity', 'step', 'story'];

export const kindLabel: Record<CardKind, string> = {
	activity: 'Activity',
	step: 'Step',
	story: 'Story',
};

export const kindDescription: Record<CardKind, string> = {
	activity: 'A thing people do, spanning several steps. The backbone of the map.',
	step: 'One point in the narrative, read left to right.',
	story: 'A piece of work, placed in the release that will carry it.',
};

export const cardClass: Record<CardKind, string> = {
	activity:
		'bg-activity border-activity-edge text-ink dark:bg-activity-night dark:border-activity-night-edge dark:text-slate-100',
	step: 'bg-step border-step-edge text-ink dark:bg-step-night dark:border-step-night-edge dark:text-slate-100',
	story: 'bg-story border-story-edge text-ink dark:bg-story-night dark:border-story-night-edge dark:text-slate-100',
};

/** The legend swatch. Same colours, no text, so it is written out too. */
export const swatchClass: Record<CardKind, string> = {
	activity: 'bg-activity border-activity-edge dark:bg-activity-night dark:border-activity-night-edge',
	step: 'bg-step border-step-edge dark:bg-step-night dark:border-step-night-edge',
	story: 'bg-story border-story-edge dark:bg-story-night dark:border-story-night-edge',
};
