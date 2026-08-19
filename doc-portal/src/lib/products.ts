/**
 * The product registry — the one thing this hub is organised by.
 *
 * Read from doc-registry, the Strapi CMS, over its content API. This file used
 * to hold sixteen invented products and promised that "replacing it is
 * deliberately a one-file job: `searchProducts`, `findProduct` and `paginate`
 * are the whole surface the pages use, so swapping the seed array for a fetch —
 * and making these three async — changes nothing above them." That is what
 * happened, and the promise held: the pages differ only by `await`.
 *
 * The seed data did not disappear, it moved. doc-registry/src/seed/products.ts
 * loads the same sixteen entries into an empty collection on first boot, so the
 * catalog looks identical to before while now being editable by a human and
 * writable by a pipeline.
 *
 * Search and pagination stay **here**, in the portal, rather than becoming
 * query parameters. Two reasons, and the second is the load-bearing one:
 *
 *   - the behaviour is already specified and tested here, down to "every term
 *     has to match" and "an out-of-range page is clamped, not empty";
 *   - a registry of a few hundred products fits in one response, and the whole
 *     set has to be fetched anyway for the count. Pushing the filter into
 *     Strapi would trade an in-memory `filter` for a query language, and buy
 *     nothing until the catalog is large enough that the fetch itself is the
 *     problem — at which point `fetchProducts` is the one function to change.
 */

import { registryApiUrl } from './links';

export type Lifecycle = 'incubating' | 'active' | 'maintained' | 'sunset';

/** A product's metrics, as the automation reports them. */
export interface ProductMetrics {
	/** Days since the living documentation was last regenerated. */
	docsUpdatedDaysAgo: number;
	/** Contracts registered for this product in api-hub. */
	apiContracts: number;
	/** api-hub's scorecard grade over those contracts. */
	contractScore: 'A' | 'B' | 'C' | 'D';
	/** Acceptance suite pass rate on the last campaign, in percent. */
	acceptancePassRate: number;
	/** Incidents currently open against the product. */
	openIncidents: number;
	/** Roadmap items started and not yet delivered. */
	roadmapItemsInFlight: number;
}

export interface Product {
	/** Stable identity, and the last path segment of the product view. */
	slug: string;
	name: string;
	/** One sentence, in the words a PM would use. Shown on the card. */
	summary: string;
	domain: string;
	/** The team that answers for it. */
	owner: string;
	contact: string;
	lifecycle: Lifecycle;
	version: string;
	/** ISO date the product was registered here. */
	registered: string;
	repository: string;
	/** Free vocabulary, and the cheapest half of search. */
	tags: readonly string[];
	metrics: ProductMetrics;
}

/**
 * How many results a catalog page shows.
 *
 * Ten, because a search result is scanned rather than read: a list long enough
 * to need scrolling stops being a comparison and becomes a browse, and the
 * eleventh card is the one that pushes the pagination out of sight.
 */
export const PAGE_SIZE = 10;

/**
 * How many entries to ask the registry for at once.
 *
 * One hundred because that is `maxLimit` in doc-registry/config/api.ts — ask
 * for more and Strapi silently caps the page, which would look like a registry
 * that lost its tail rather than a request that was too greedy. `fetchProducts`
 * follows the pagination metadata past it.
 */
const REGISTRY_PAGE_SIZE = 100;

/**
 * How long to wait for the registry before giving up.
 *
 * A page that hangs is worse than a page that says the registry is unreachable:
 * the visitor cannot tell the difference between slow and broken, and neither
 * can the ingress. Five seconds is far longer than a healthy in-cluster call
 * and short enough to stay inside anyone's patience.
 */
const REGISTRY_TIMEOUT_MS = 5_000;

/**
 * The registry could not be read.
 *
 * Distinct from "no products matched" on purpose — the pages render the two
 * very differently, and conflating them is how an outage comes to look like an
 * empty catalog.
 */
export class RegistryError extends Error {
	constructor(message: string, options?: { cause?: unknown }) {
		super(message, options);
		this.name = 'RegistryError';
	}
}

/** One entry as Strapi 5 returns it: flat attributes, plus its own two ids. */
interface RegistryEntry {
	slug?: unknown;
	name?: unknown;
	summary?: unknown;
	domain?: unknown;
	owner?: unknown;
	contact?: unknown;
	lifecycle?: unknown;
	version?: unknown;
	registered?: unknown;
	repository?: unknown;
	tags?: unknown;
	metrics?: Record<string, unknown> | null;
}

interface RegistryResponse {
	data?: RegistryEntry[];
	meta?: { pagination?: { page?: number; pageCount?: number; total?: number } };
}

function asString(value: unknown, fallback = ''): string {
	return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Turn one registry entry into a Product.
 *
 * Every field is coerced rather than trusted. The registry is a CMS with a
 * schema, so the shape is nearly always right — but "nearly always" is exactly
 * the case that renders `undefined` into a card, and a missing `metrics`
 * component is a real state: an entry registered by hand, before any pipeline
 * has reported anything about it. Zeroes are the honest answer there, and the
 * indicators read them as "abandoned documentation, failing contracts", which
 * is what an unmeasured product should look like.
 */
function toProduct(entry: RegistryEntry): Product {
	const metrics = entry.metrics ?? {};
	const grade = asString(metrics.contractScore, 'D');

	return {
		slug: asString(entry.slug),
		name: asString(entry.name),
		summary: asString(entry.summary),
		domain: asString(entry.domain),
		owner: asString(entry.owner),
		contact: asString(entry.contact),
		lifecycle: asString(entry.lifecycle, 'incubating') as Lifecycle,
		version: asString(entry.version),
		registered: asString(entry.registered),
		repository: asString(entry.repository),
		// `tags` is a json column, so the schema does not constrain it further.
		tags: Array.isArray(entry.tags) ? entry.tags.filter((tag) => typeof tag === 'string') : [],
		metrics: {
			docsUpdatedDaysAgo: asNumber(metrics.docsUpdatedDaysAgo),
			apiContracts: asNumber(metrics.apiContracts),
			contractScore: (['A', 'B', 'C', 'D'].includes(grade) ? grade : 'D') as ProductMetrics['contractScore'],
			acceptancePassRate: asNumber(metrics.acceptancePassRate),
			openIncidents: asNumber(metrics.openIncidents),
			roadmapItemsInFlight: asNumber(metrics.roadmapItemsInFlight),
		},
	};
}

/**
 * Every registered product, in the order the catalog shows them.
 *
 * Sorted by the registry rather than here, so two pages of one result set
 * cannot disagree about what comes first.
 *
 * Deliberately uncached. The catalog is a query whose answer changes the moment
 * somebody edits an entry or a pipeline reports a metric, and a cache would
 * make a hub about *how current your documentation is* the one page that shows
 * you a stale copy of it. Reconsider when the registry is large or remote —
 * against a Service one DNS hop away it is not worth the staleness.
 *
 * @throws {RegistryError} if the registry cannot be reached or does not answer
 *   with what it promised. Never returns an empty array to mean "unreachable".
 */
export async function fetchProducts(): Promise<readonly Product[]> {
	const base = registryApiUrl().replace(/\/+$/, '');
	const products: Product[] = [];

	// Paged rather than fetched in one go: `maxLimit` caps a page at 100, and a
	// registry that outgrows one page should not quietly lose its tail.
	for (let page = 1; ; page += 1) {
		const url =
			`${base}/api/products` +
			`?populate=metrics&sort=name:asc` +
			`&pagination[page]=${page}&pagination[pageSize]=${REGISTRY_PAGE_SIZE}`;

		let response: Response;
		try {
			response = await fetch(url, {
				headers: { accept: 'application/json' },
				signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
			});
		} catch (cause) {
			throw new RegistryError(`Could not reach the registry at ${base}.`, { cause });
		}

		if (!response.ok) {
			// 403 is the one worth naming: it means the public role lost its
			// find/findOne grant, which doc-registry's bootstrap makes and an
			// administrator can revoke in the admin UI.
			const hint =
				response.status === 403
					? ' The public role may no longer be allowed to read products.'
					: '';
			throw new RegistryError(
				`The registry answered ${response.status} ${response.statusText}.${hint}`,
			);
		}

		let payload: RegistryResponse;
		try {
			payload = (await response.json()) as RegistryResponse;
		} catch (cause) {
			throw new RegistryError('The registry did not answer with JSON.', { cause });
		}

		if (!Array.isArray(payload.data)) {
			throw new RegistryError('The registry answered without a "data" array.');
		}

		products.push(...payload.data.map(toProduct));

		const pageCount = payload.meta?.pagination?.pageCount ?? 1;
		if (page >= pageCount) break;
	}

	return products;
}

export async function findProduct(slug: string): Promise<Product | undefined> {
	const products = await fetchProducts();
	return products.find((product) => product.slug === slug);
}

/**
 * Search across the fields a person actually types.
 *
 * Every whitespace-separated term has to match somewhere (AND, not OR), which is
 * what makes a second word narrow the result rather than widen it — the
 * behaviour anyone who has used a search box expects, and the one a naive
 * `some()` gets backwards.
 *
 * An empty query returns everything: the catalog with no query is a browse, and
 * an empty result there would read as "there are no products".
 */
export async function searchProducts(query: string): Promise<readonly Product[]> {
	const products = await fetchProducts();
	const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (terms.length === 0) return products;

	return products.filter((product) => {
		const haystack = [
			product.name,
			product.summary,
			product.domain,
			product.owner,
			product.lifecycle,
			...product.tags,
		]
			.join(' ')
			.toLowerCase();

		return terms.every((term) => haystack.includes(term));
	});
}

export interface Page<T> {
	items: readonly T[];
	/** 1-based, and always within range — see `paginate`. */
	page: number;
	pageCount: number;
	total: number;
	pageSize: number;
}

/**
 * Cut a result set into pages of `PAGE_SIZE`.
 *
 * The requested page is clamped rather than trusted: `?page=99` on a two-page
 * result is a stale link or a typed URL, and showing the last page beats an
 * empty list that looks like "nothing matched".
 *
 * Still synchronous: it takes a result set rather than fetching one, which is
 * what kept it unchanged when the registry moved out of this file.
 */
export function paginate<T>(items: readonly T[], page: number): Page<T> {
	const total = items.length;
	const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
	const current = Math.min(Math.max(1, page), pageCount);
	const start = (current - 1) * PAGE_SIZE;

	return {
		items: items.slice(start, start + PAGE_SIZE),
		page: current,
		pageCount,
		total,
		pageSize: PAGE_SIZE,
	};
}
