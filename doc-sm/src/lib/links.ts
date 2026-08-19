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
 * doc-sm reads no registry and calls no API, so the only entries here are links
 * out. The file exists at two entries rather than being deferred because the
 * alternative is hard-coding a hostname in a template, which is how the next
 * environment gets a link that 404s.
 */

function fromEnv(name: string, fallback: string): string {
  return process.env[name] ?? import.meta.env[name] ?? fallback;
}

/** doc-hub's own portal — the catalogue this board's products come from. */
export function docPortalUrl(): string {
  return fromEnv('DOC_PORTAL_URL', 'http://doc-portal.localhost');
}

/**
 * The registry's admin UI, as the *browser* sees it.
 *
 * A link, not a call: doc-sm never fetches from it. A story map is a file, and
 * the registry holds product identity — the two do not meet, by design.
 */
export function registryUrl(): string {
  return fromEnv('REGISTRY_URL', 'http://doc-registry.localhost');
}
