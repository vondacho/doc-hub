/**
 * Product metrics turned into the tiles shown on a product view.
 *
 * The thresholds live here, in one place, on purpose: a status that is decided
 * inside a component ends up decided twice, differently, the first time a second
 * page shows the same number.
 *
 * Two rules govern how these are rendered, and both come from the fact that a
 * status is meaning rather than decoration:
 *
 *   - **never colour alone.** Every tile carries an icon and a word as well as a
 *     colour. `warning` and `serious` sit below 3:1 on the light surface, and
 *     roughly one reader in twelve cannot separate the four hues at all.
 *   - **`neutral` is a real answer.** A count of API contracts is context, not a
 *     grade. Painting it green would invent a target nobody set.
 */

import type { Product } from './products';

export type IndicatorStatus = 'good' | 'warning' | 'serious' | 'critical' | 'neutral';

export interface Indicator {
	label: string;
	/** Already formatted, unit included — the tile prints it as it stands. */
	value: string;
	status: IndicatorStatus;
	/** The status as a word. Rendered beside the colour, never replaced by it. */
	statusLabel: string;
	/** What the number means and where it comes from. */
	hint: string;
}

/**
 * The five status presentations.
 *
 * Shapes are deliberately different from one another — a circle, a triangle, a
 * diamond, an octagon, a dash — so the icon carries the distinction on its own
 * in print, in forced-colours mode, and for a reader who sees no hue difference.
 */
export const statusPresentation: Record<
	IndicatorStatus,
	{ icon: string; text: string; dot: string }
> = {
	good: {
		icon: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm-3.4 9.2 2.4 2.4 4.6-5',
		text: 'text-good',
		dot: 'bg-good',
	},
	warning: {
		icon: 'M12 4 21 20H3L12 4Zm0 5.8v4.6m0 2.6v.6',
		text: 'text-warning',
		dot: 'bg-warning',
	},
	serious: {
		icon: 'M12 3 21 12l-9 9-9-9 9-9Zm0 5.4v5m0 2.6v.6',
		text: 'text-serious',
		dot: 'bg-serious',
	},
	critical: {
		icon: 'M8.2 3h7.6L21 8.2v7.6L15.8 21H8.2L3 15.8V8.2L8.2 3ZM9 9l6 6m0-6-6 6',
		text: 'text-critical',
		dot: 'bg-critical',
	},
	neutral: {
		icon: 'M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm-4 9h8',
		text: 'text-ink-muted dark:text-slate-400',
		dot: 'bg-slate-400',
	},
};

/** Days since the docs were regenerated. A hub about documentation leads with it. */
function freshness(days: number): Indicator {
	const status: IndicatorStatus =
		days <= 7 ? 'good' : days <= 30 ? 'warning' : days <= 90 ? 'serious' : 'critical';
	const statusLabel =
		days <= 7 ? 'Fresh' : days <= 30 ? 'Ageing' : days <= 90 ? 'Stale' : 'Abandoned';

	return {
		label: 'Documentation age',
		value: days === 1 ? '1 day' : `${days} days`,
		status,
		statusLabel,
		hint: 'Since the last pipeline run that regenerated this product’s documentation.',
	};
}

function contractScore(grade: Product['metrics']['contractScore']): Indicator {
	const status: IndicatorStatus = { A: 'good', B: 'warning', C: 'serious', D: 'critical' }[
		grade
	] as IndicatorStatus;
	const statusLabel = { A: 'Strong', B: 'Acceptable', C: 'Weak', D: 'Failing' }[grade];

	return {
		label: 'Contract score',
		value: grade,
		status,
		statusLabel,
		hint: 'api-hub’s scorecard over every contract registered for this product.',
	};
}

function acceptance(rate: number): Indicator {
	const status: IndicatorStatus =
		rate >= 95 ? 'good' : rate >= 90 ? 'warning' : rate >= 80 ? 'serious' : 'critical';
	const statusLabel =
		rate >= 95 ? 'Green' : rate >= 90 ? 'Slipping' : rate >= 80 ? 'Degraded' : 'Broken';

	return {
		label: 'Acceptance tests',
		value: `${rate}%`,
		status,
		statusLabel,
		hint: 'Pass rate of the last acceptance campaign reported by qa-hub.',
	};
}

function incidents(count: number): Indicator {
	const status: IndicatorStatus =
		count === 0 ? 'good' : count <= 2 ? 'warning' : count <= 4 ? 'serious' : 'critical';
	const statusLabel = count === 0 ? 'Clear' : count <= 2 ? 'Watch' : count <= 4 ? 'Pressure' : 'Firefighting';

	return {
		label: 'Open incidents',
		value: String(count),
		status,
		statusLabel,
		hint: 'Incidents currently open against this product in the operations backlog.',
	};
}

/**
 * The tiles, in reading order: how current the documentation is, then the two
 * numbers that say whether the product is behaving, then the two counts that are
 * context rather than judgement.
 */
export function indicatorsOf(product: Product): readonly Indicator[] {
	const { metrics } = product;

	return [
		freshness(metrics.docsUpdatedDaysAgo),
		contractScore(metrics.contractScore),
		acceptance(metrics.acceptancePassRate),
		incidents(metrics.openIncidents),
		{
			label: 'API contracts',
			value: String(metrics.apiContracts),
			status: 'neutral',
			statusLabel: 'Registered',
			hint: 'Contracts published for this product in api-hub. A count, not a grade.',
		},
		{
			label: 'Roadmap in flight',
			value: String(metrics.roadmapItemsInFlight),
			status: 'neutral',
			statusLabel: 'Started',
			hint: 'Roadmap items started and not yet delivered. A count, not a grade.',
		},
	];
}
