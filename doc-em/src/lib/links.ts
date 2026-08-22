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
 * All three are **browser-facing links**: doc-em calls nothing. An example map
 * is a file the visitor picked, parsed in their browser, so unlike doc-sm there
 * is no in-cluster address here at all and the chart has no Secret.
 */

function fromEnv(name: string, fallback: string): string {
  return process.env[name] ?? import.meta.env[name] ?? fallback;
}

/** doc-hub's own portal — the catalogue this board's products come from. */
export function docPortalUrl(): string {
  return fromEnv('DOC_PORTAL_URL', 'http://doc-portal.localhost');
}

/** dev-hub's page on the practice — the source this component was built from. */
export function practiceUrl(): string {
  return fromEnv('PRACTICE_URL', 'http://dev-portal.localhost/doc/practices/example-mapping/');
}

/** doc-sm, the board that picks which story to open. */
export function storyMapperUrl(): string {
  return fromEnv('STORY_MAPPER_URL', 'http://doc-sm.localhost');
}
