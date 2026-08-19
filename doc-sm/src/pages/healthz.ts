import type { APIRoute } from 'astro';

// Probe target for the Helm chart's startup/liveness/readiness checks.
// Deliberately renders no page: it answers whether the Node server is serving,
// not whether any particular route is healthy.
//
// There is nothing else it could usefully check. doc-sm calls no registry and
// owns no database — a board lives in the tab it was opened in — so this probe
// has no dependency to be honest or dishonest about.
export const GET: APIRoute = () =>
  new Response(JSON.stringify({ status: 'UP' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
