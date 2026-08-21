import type { APIRoute } from 'astro';
import { ticketingApiUrl } from '../../lib/links';
import { createTicket, isFailure } from '../../lib/ticketing';

/**
 * Raise a ticket for a story.
 *
 * The board cannot call the ticketing system itself: the address is in-cluster,
 * so a browser cannot reach it — and handing that address to a browser would be
 * wrong even if it could. So the island posts here and this route makes the
 * call, exactly as the board page reads the registry server-side.
 *
 * A server route, so it is not prerendered.
 */
export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let body: { space?: unknown; product?: unknown; title?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }

  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const product = typeof body.product === 'string' && body.product !== '' ? body.product : null;
  const space = typeof body.space === 'string' && body.space !== '' ? body.space : null;

  if (title === '') return json({ error: 'A ticket needs a title.' }, 400);
  // A precondition this side failed, not upstream trouble. createTicket refuses
  // it too, but going through that path would report it as a 502 and blame the
  // ticketing system for something it was never asked.
  if (space === null) {
    return json({ error: 'Set a ticketing space, or pick a product to take it from.' }, 400);
  }

  const result = await createTicket(ticketingApiUrl(), { space, product, title });

  // A failure here is usually not a server fault: an unconfigured tracker, an
  // unreachable one, and a story with no product are all ordinary states the
  // board has something sensible to say about. 502 is kept for the case that
  // really is upstream trouble.
  if (isFailure(result)) {
    return json(
      { error: result.error, unconfigured: result.unconfigured === true },
      result.unconfigured ? 200 : 502,
    );
  }

  return json(result, 201);
};

function json(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
