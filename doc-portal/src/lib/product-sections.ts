/**
 * The eight perspectives on one product — the panels on a product view.
 *
 * Two kinds, and the distinction is the same one dev-portal draws in its
 * catalog:
 *
 *   external — the perspective already exists in a neighbouring hub. C4 and
 *              Events are model-hub's, generated from the LikeC4 and
 *              EventCatalog DSLs. Rebuilding either here would only produce a
 *              staler second view over the same model, so the panel links out
 *              and the address comes from src/lib/links.ts, resolved per
 *              request.
 *   internal — the perspective belongs to this hub. Each one is a page under
 *              /catalog/<product>/<section>, rendered by a single route, and
 *              each says what it will hold and which automation will fill it.
 *
 * The internal pages are scaffolds. They are pages rather than dead links on
 * purpose: a panel that goes nowhere teaches visitors to stop clicking panels.
 */

import { modelC4Url, modelEventcatalogUrl, qaPortalUrl } from './links';
import type { Product } from './products';

type PanelStatus = 'live' | 'soon' | 'planned';

export interface ProductSection {
	/** Stable identity, and the last path segment of an internal section. */
	slug: string;
	title: string;
	/** The one question this perspective answers that the others cannot. */
	question: string;
	/** Panel blurb. */
	description: string;
	/** A single SVG path `d`, stroked. Multiple subpaths are fine. */
	icon: string;
	cta: string;
	status: PanelStatus;
	/** Where the panel goes. A function when the address is configuration. */
	href: (product: Product) => string;
	/** True for a link that leaves the portal, so it is marked and opens safely. */
	external?: boolean;
	/** Internal sections only: what the page will hold once it is fed. */
	contents?: readonly string[];
	/** Internal sections only: the automation expected to fill it. */
	source?: string;
}

/*
 * Deep links into the neighbouring hubs are deliberately left at the hub root.
 * The path shape of a per-product view belongs to model-hub, and inventing one
 * here would produce a link that 404s the day it is deployed. Narrow these to
 * `${modelC4Url()}/<whatever model-hub settles on>/${product.slug}` once that
 * hub publishes its routes.
 */
export const productSections: readonly ProductSection[] = [
	{
		slug: 'documentation',
		title: 'Documentation',
		question: 'What does this product do, for whom, and in whose words?',
		description:
			'The living documentation: scope, capabilities, the glossary the team speaks, and the decisions that shaped it.',
		icon: 'M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm8 0v6h6M8 14h8M8 17.5h5',
		cta: 'Read the documentation',
		status: 'soon',
		href: (product) => `/catalog/${product.slug}/documentation`,
		source:
			'Generated on every pipeline run on `develop`, from the product repository and its registry entry.',
		contents: [
			'Scope and business capabilities',
			'The ubiquitous language, one glossary per bounded context',
			'Architecture decision records',
			'Release notes, per version',
		],
	},
	{
		slug: 'roadmap',
		title: 'Roadmap',
		question: 'Where is this product going, and what was consciously not started?',
		description:
			'Themes committed to, what is in flight, what is delivered — and the items kept visible below the line rather than deleted.',
		icon: 'M4 19h16M6 19V9m6 10V5m6 14v-7M6 9l6-4 6 7',
		cta: 'See the roadmap',
		status: 'soon',
		href: (product) => `/catalog/${product.slug}/roadmap`,
		source: 'The product management tool, read through the registry.',
		contents: [
			'Now, next and later, per theme',
			'Delivered items with the release that carried them',
			'Below the line: what is known and not committed to',
		],
	},
	{
		slug: 'epics',
		title: 'Epics',
		question: 'What is being built right now, and what outcome does it claim?',
		description:
			'The open epics, each with the stories it holds, the slice of the story map it came from, and the benefit it promises.',
		icon: 'M4 6h10M4 12h16M4 18h7m6-9 4 3-4 3',
		cta: 'See the epics',
		status: 'soon',
		href: (product) => `/catalog/${product.slug}/epics`,
		source: 'The tracker, one direction only — the repository stays the source of truth.',
		contents: [
			'Open epics with their stories and status',
			'The story-map slice each epic belongs to',
			'The `so that` clause, kept intact from the story file',
		],
	},
	{
		slug: 'sprints',
		title: 'Sprints',
		question: 'What did the team commit to, and what actually shipped?',
		description:
			'The recent sprints: what was committed, what was delivered, what carried over, and the forecast that follows from it.',
		icon: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm3-2v4m8-4v4M4 9h16M8 13h3m-3 3.5h7',
		cta: 'See the sprints',
		status: 'soon',
		href: (product) => `/catalog/${product.slug}/sprints`,
		source: 'The tracker, aggregated per iteration.',
		contents: [
			'Commitment against delivery, per sprint',
			'Carry-over and its reasons',
			'A forecast expressed as a range, never as a single date',
		],
	},
	{
		slug: 'c4',
		title: 'C4',
		question: 'How is this product structured, at four zoom levels?',
		description:
			'Context, container, component and deployment views generated from one LikeC4 model, so the zoom levels cannot contradict each other.',
		icon: 'M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z',
		cta: 'Open the C4 model',
		status: 'live',
		href: () => modelC4Url(),
		external: true,
	},
	{
		slug: 'events',
		title: 'Events',
		question: 'What crosses this product’s boundary, and who is listening?',
		description:
			'The messages it publishes and consumes, their schemas and versions, and the products on the other end of each one.',
		icon: 'M13 3 4.5 13.5H11L10 21l8.5-10.5H12L13 3Z',
		cta: 'Open the event catalogue',
		status: 'live',
		href: () => modelEventcatalogUrl(),
		external: true,
	},
	{
		slug: 'campaigns',
		title: 'Campaigns',
		question: 'What was tested, when, and what did it find?',
		description:
			'Acceptance, regression and non-functional campaigns run against this product, with the scenarios each one executed.',
		icon: 'M9 3h6M10 3v6.2L4.9 17.9A2 2 0 0 0 6.6 21h10.8a2 2 0 0 0 1.7-3.1L14 9.2V3M7.6 14h8.8',
		cta: 'See the campaigns',
		status: 'soon',
		href: (product) => `/catalog/${product.slug}/campaigns`,
		source: 'Campaign runs reported by qa-hub, summarised here per product.',
		contents: [
			'The last runs, per campaign type, with their pass rate',
			'Scenario names as written in the feature files — not test titles someone invented',
			'Non-functional results against the stated NFRs',
		],
	},
	{
		slug: 'incidents',
		title: 'Incidents',
		question: 'What broke, for how long, and what changed because of it?',
		description:
			'Production incidents against this product, their duration and impact, and the follow-up each one produced.',
		icon: 'M12 3.5 21.5 20H2.5L12 3.5Zm0 5.5v5.2m0 2.8v.6',
		cta: 'See the incidents',
		status: 'soon',
		href: (product) => `/catalog/${product.slug}/incidents`,
		source: 'Observability and the incident record, joined on the product’s deployed components.',
		contents: [
			'Open and recent incidents, with duration and impact',
			'The change that caused it, where the pipeline can name one',
			'Follow-up actions, and whether they were done',
		],
	},
] as const;

/** The internal sections, keyed by slug — what /catalog/[slug]/[section] serves. */
export function findInternalSection(slug: string): ProductSection | undefined {
	return productSections.find((section) => section.slug === slug && !section.external);
}

/** Where campaigns will come from, resolved per request like every other address. */
export function campaignsHubUrl(): string {
	return qaPortalUrl();
}
