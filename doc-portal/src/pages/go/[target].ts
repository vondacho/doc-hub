import type { APIRoute } from 'astro';
import {
  apiPortalUrl,
  devPortalUrl,
  modelC4Url,
  modelEventcatalogUrl,
  modelPortalUrl,
  qaPortalUrl,
  registryUrl,
} from '../../lib/links';

/*
 * Redirects to the neighbouring hubs, by a stable in-portal path.
 *
 * Every page in this portal is server-rendered today, so each one *could*
 * resolve these addresses itself and link straight out — and the pages that
 * front a specific hub do exactly that, saving the visitor a round trip.
 *
 * This route exists for the links that are quoted rather than rendered: a
 * printed URL, a bookmark, an email, or any page that later becomes prerendered.
 * Resolving on the build machine would bake one environment's hostname into the
 * image and leave MODEL_C4_URL in the chart silently doing nothing.
 *
 * 302, not 301: these targets are configuration and move between environments,
 * and a browser that cached a permanent redirect would keep following the old
 * one long after the value changed.
 */
const targets: Record<string, () => string> = {
  api: apiPortalUrl,
  model: modelPortalUrl,
  c4: modelC4Url,
  events: modelEventcatalogUrl,
  dev: devPortalUrl,
  qa: qaPortalUrl,
  registry: registryUrl,
};

export const GET: APIRoute = ({ params }) => {
  const resolve = params.target ? targets[params.target] : undefined;

  if (!resolve) {
    return new Response(null, { status: 404, statusText: 'Not found' });
  }

  return new Response(null, {
    status: 302,
    headers: {
      location: resolve(),
      'cache-control': 'no-store',
    },
  });
};
