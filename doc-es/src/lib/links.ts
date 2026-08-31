/**
 * Addresses that differ per environment.
 *
 * Same treatment as doc-portal's src/lib/links.ts, and for the same reason:
 * these are configuration, so they are read at *call* time rather than at module
 * load. The chart injects them into the running container, which means they do
 * not exist when this module is first evaluated.
 *
 * `process.env` first for the container, `import.meta.env` second for the dev
 * server reading a local .env, then a default that matches what the chart ships
 * — so an unset value and the default look identical, and neither looks broken.
 *
 * Most of these are **browser-facing links**, and one is not. The distinction is
 * load-bearing — it is the same split doc-portal draws between REGISTRY_URL and
 * REGISTRY_API_URL. A link is resolved by the visitor's browser and must be an
 * address the browser can reach; a call is made by this server and must not be,
 * because leaving the cluster to come back in to a Service one DNS name away
 * breaks the moment the ingress is disabled.
 *
 * doc-es used to call nothing at all, and the product picker is what ended that.
 * The map is still a file the visitor picked and parsed in their own browser;
 * the one thing the server fetches is the list of products to choose from.
 */

function fromEnv(name: string, fallback: string): string {
  return process.env[name] ?? import.meta.env[name] ?? fallback;
}

/** doc-hub's own portal — the catalogue this board's products come from. */
export function docPortalUrl(): string {
  return fromEnv('DOC_PORTAL_URL', 'http://doc-portal.localhost');
}

/**
 * ba-portal's prompt page — the canonical set, by role, across every board.
 *
 * The assistant panel carries this board's prompts inline; this is where the
 * reasoning behind them lives, and the other four boards' sets with it.
 */
export function promptsUrl(): string {
  return `${fromEnv('BA_PORTAL_URL', 'http://ba-portal.localhost')}/doc/tooling/prompts/`;
}

/** dev-hub's page on the practice — the source this component was built from. */
export function practiceUrl(): string {
  return fromEnv('PRACTICE_URL', 'http://dev-portal.localhost/doc/practices/event-storming/');
}

/**
 * The registry's admin UI, as the *browser* sees it — a link, not a call.
 *
 * Where somebody goes to register a product that is missing from the picker.
 */
export function registryUrl(): string {
  return fromEnv('REGISTRY_URL', 'http://doc-registry.localhost');
}

/**
 * The same registry, as *this server* sees it — the one entry here that is an
 * in-cluster call rather than a browser-facing link.
 *
 * Read once per render of the board page, to fill the product picker. It is the
 * only request doc-es makes, and it must not be an ingress host: doc-registry is
 * a release in the same namespace, so the Service name is enough.
 * Cross-namespace would need doc-registry.<namespace>.svc.
 */
export function registryApiUrl(): string {
  return fromEnv('REGISTRY_API_URL', 'http://localhost:1337');
}

/** doc-sm, where the work implied by the seams found here is cut. */
export function storyMapperUrl(): string {
  return fromEnv('STORY_MAPPER_URL', 'http://doc-sm.localhost');
}
