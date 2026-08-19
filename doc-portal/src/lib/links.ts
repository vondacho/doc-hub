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
 */

function fromEnv(name: string, fallback: string): string {
  return process.env[name] ?? import.meta.env[name] ?? fallback;
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
 * The CMS holding the product registry.
 *
 * Nothing reads it yet — /registration is a form over a registry that does not
 * exist. The address is here so that wiring it up is a configuration change and
 * an API call, not a hunt through the pages for a hardcoded host.
 */
export function registryUrl(): string {
  return fromEnv('REGISTRY_URL', 'http://doc-registry.localhost');
}
