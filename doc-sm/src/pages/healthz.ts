import type { APIRoute } from 'astro';

// Probe target for the Helm chart's startup/liveness/readiness checks.
// Deliberately renders no page: it answers whether the Node server is serving,
// not whether any particular route is healthy.
//
// The board page reads doc-registry to fill its product picker, and this probe
// deliberately does not. Same rule doc-portal states: the probe does not touch
// the registry, so a CMS blip does not get doc-sm restarted by its own kubelet —
// and it should not, because an unreachable registry costs the picker and
// nothing else. The board still opens, imports, edits and exports.
export const GET: APIRoute = () =>
  new Response(JSON.stringify({ status: 'UP' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
