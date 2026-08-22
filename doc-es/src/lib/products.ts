/**
 * The registered products, read from doc-registry.
 *
 * This module is the reason doc-es is no longer a component that calls nothing.
 * The board offers a picker of registered products so a map can say what it is
 * about, and a picker needs a list. Everything else here is still local: the map
 * itself is a file, and nothing about it is ever sent anywhere.
 *
 * A deliberately thinner cousin of doc-portal's src/lib/products.ts. That one
 * fetches the full catalogue with its metrics because it renders it; this one
 * needs two fields, so it asks for two fields and coerces nothing else. Copying
 * the whole module would have brought indicators, sections and lifecycle along
 * with it, none of which an event storm has an opinion about.
 *
 * ## An unreachable registry is not an error here
 *
 * doc-portal answers 503 when the registry is down, because a catalogue that
 * cannot be read is an outage — "I could not find out whether this product
 * exists" is a different claim from "it does not exist", and the portal has to
 * make the honest one.
 *
 * doc-es is in a different position. The registry is not what the page is about;
 * it fills in one control. So a failure here degrades to an empty list and the
 * board falls back to a plain text box for the shortname. Losing the picker is a
 * worse board; refusing to open the board at all would be a worse tool.
 */

const REGISTRY_PAGE_SIZE = 100; // doc-registry's config/api.ts maxLimit
const REGISTRY_TIMEOUT_MS = 5_000;

export interface Product {
	/** doc-registry's `slug` — the shortname, and the identity written to the file. */
	readonly shortname: string;
	/** The display name. Shown in the picker, never stored on the board. */
	readonly name: string;
}

/** What the page got, and whether the picker can be trusted to be complete. */
export interface ProductList {
	readonly products: readonly Product[];
	/**
	 * Set when the registry could not be read. The board uses it to say so rather
	 * than presenting an empty picker, which would look like a registry with no
	 * products in it — a different and much more alarming claim.
	 */
	readonly unavailable: string | null;
}

interface RegistryEntry {
	slug?: unknown;
	name?: unknown;
}

interface RegistryResponse {
	data?: RegistryEntry[];
	meta?: { pagination?: { pageCount?: number } };
}

function asString(value: unknown, fallback = ''): string {
	return typeof value === 'string' ? value : fallback;
}

/**
 * Every registered product, by shortname and name.
 *
 * Never throws. The failure is in the return value because every caller has to
 * handle it anyway — see the note at the top of this file.
 */
export async function fetchProducts(baseUrl: string): Promise<ProductList> {
	const base = baseUrl.replace(/\/+$/, '');
	const products: Product[] = [];

	try {
		for (let page = 1; ; page += 1) {
			// `fields` keeps the response to what is used. The registry would
			// happily send metrics and every other column, and paging through a
			// catalogue of them to fill a dropdown would be wasteful in a way that
			// only shows up once the catalogue is large.
			const url =
				`${base}/api/products` +
				`?fields[0]=slug&fields[1]=name&sort=name:asc` +
				`&pagination[page]=${page}&pagination[pageSize]=${REGISTRY_PAGE_SIZE}`;

			const response = await fetch(url, {
				headers: { accept: 'application/json' },
				signal: AbortSignal.timeout(REGISTRY_TIMEOUT_MS),
			});

			if (!response.ok) {
				const hint =
					response.status === 403
						? ' The public role may no longer be allowed to read products.'
						: '';
				return {
					products: [],
					unavailable: `The registry answered ${response.status} ${response.statusText}.${hint}`,
				};
			}

			const payload = (await response.json()) as RegistryResponse;
			if (!Array.isArray(payload.data)) {
				return { products: [], unavailable: 'The registry sent something that is not a product list.' };
			}

			for (const entry of payload.data) {
				const shortname = asString(entry.slug);
				// An entry with no slug has no identity to write into a file, so it
				// is skipped rather than offered as an unselectable row.
				if (shortname === '') continue;
				products.push({ shortname, name: asString(entry.name, shortname) });
			}

			const pageCount = payload.meta?.pagination?.pageCount ?? 1;
			if (page >= pageCount) break;
		}
	} catch {
		return { products: [], unavailable: `Could not reach the registry at ${base}.` };
	}

	return { products, unavailable: null };
}
