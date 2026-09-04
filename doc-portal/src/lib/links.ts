/**
 * Addresses of the neighbouring hubs, and of the registry behind this one.
 *
 * Read at call time rather than at module load, matching dev-portal's copy of
 * this file: a chart injects the value as an env var, so it only exists in the
 * running container, while `import.meta.env` covers the dev server reading a
 * .env file.
 *
 * These are **browser-facing links, not in-cluster calls**: the visitor's
 * browser resolves them, so an in-cluster address like http://arch-c4:8080
 * would be wrong even though this portal is server-rendered.
 *
 * The defaults are the Traefik ingress hosts a local cluster enables.
 *
 * `registryApiUrl` at the bottom is the single exception, and says why.
 */

function fromEnv(name: string, fallback: string): string {
  return process.env[name] ?? import.meta.env[name] ?? fallback;
}

/**
 * This portal's own public address.
 *
 * A portal that never needed to know where it was until /hub, which is the
 * estate's front door and is served under a second host name — so `/` there is
 * the estate page, and doc-hub's own card has to name the portal absolutely or
 * it would link the front door back to itself.
 */
export function docPortalUrl(): string {
  return fromEnv('DOC_PORTAL_URL', 'http://doc-portal.localhost');
}

/**
 * doc-hub's three boards.
 *
 * `STORY_MAPPER_URL` is the name doc-em and doc-es already use for the same
 * address, and the other two follow it rather than inventing a second
 * convention for the same kind of thing.
 */
export function storyMapperUrl(): string {
  return fromEnv('STORY_MAPPER_URL', 'http://doc-sm.localhost');
}

export function exampleMapperUrl(): string {
  return fromEnv('EXAMPLE_MAPPER_URL', 'http://doc-em.localhost');
}

export function eventStormerUrl(): string {
  return fromEnv('EVENT_STORMER_URL', 'http://doc-es.localhost');
}

/**
 * ba-hub's context mapper: bounded contexts, and the relationships between them.
 *
 * It **replaces ba-ddd-mapper**, which is the name the three boards in this
 * repository still cite throughout their own comments — they were ported from
 * it, and those references are to the predecessor rather than to a second tool
 * that also exists.
 *
 * `BA_CM_URL` rather than `CONTEXT_MAPPER_URL`, which is the convention the
 * three functions above follow. They are *this* hub's tools; a tool belonging
 * to another hub is named for the hub that owns it, as `MODEL_C4_URL` and
 * `BA_PORTAL_URL` already are.
 */
export function contextMapperUrl(): string {
  return fromEnv('BA_CM_URL', 'http://ba-cm.localhost');
}

/** api-hub's portal: the API catalogue, its scorecards and its registry. */
export function apiPortalUrl(): string {
  return fromEnv('API_PORTAL_URL', 'http://api-portal.localhost');
}

/** arch-hub's portal: the architecture perspective on a product. */
export function modelPortalUrl(): string {
  return fromEnv('MODEL_PORTAL_URL', 'http://arch-portal.localhost');
}

/** The C4 model site built by arch-hub, from the LikeC4 DSL. */
export function modelC4Url(): string {
  return fromEnv('MODEL_C4_URL', 'http://arch-c4.localhost');
}

/** The EventCatalog site built by model-hub. */
export function modelEventcatalogUrl(): string {
  return fromEnv('MODEL_EVENTCATALOG_URL', 'http://arch-eventcatalog.localhost');
}

/** dev-hub's portal: practices, code design, stacks and the MCP servers. */
export function devPortalUrl(): string {
  return fromEnv('DEV_PORTAL_URL', 'http://dev-portal.localhost');
}

/** qa-hub's portal: campaigns, reports, requirements and NFRs. */
export function qaPortalUrl(): string {
  return fromEnv('QA_PORTAL_URL', 'http://qa-portal.localhost');
}

/**
 * The CMS holding the product registry, **as the browser sees it**.
 *
 * Printed rather than called: /registration shows it as the address an entry
 * would be posted to, and it is where a person goes to open the admin UI. It
 * follows the same rule as every other address in this file.
 */
export function registryUrl(): string {
  return fromEnv('REGISTRY_URL', 'http://doc-registry.localhost');
}

/**
 * The same CMS, **as this server sees it** — and the one exception to the rule
 * stated at the top of this file.
 *
 * The catalog is fetched during server-side rendering, so the request leaves
 * the portal's own process and never the visitor's browser. In the cluster that
 * makes the ingress host the wrong address: it would route back out through
 * Traefik and in again, to reach a Service sitting one DNS name away. The right
 * address is the in-cluster one, `http://doc-registry:1337`, which is what the
 * chart injects.
 *
 * Keeping the two apart is the whole reason this function exists rather than
 * reusing registryUrl(). They point at the same CMS and are resolved by
 * different resolvers, and collapsing them breaks whichever caller is not the
 * one you were thinking about.
 *
 * The default is the dev server's: `npm run develop` in doc-registry listens on
 * 1337, so a local portal finds a local registry with no configuration.
 */
export function registryApiUrl(): string {
  return fromEnv('REGISTRY_API_URL', 'http://localhost:1337');
}
