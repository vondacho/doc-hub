/**
 * The connected ticketing system.
 *
 * doc-sm does not issue ticket ids and does not decide statuses. It asks. This
 * module is the whole of that conversation, and it is deliberately tiny.
 *
 * ## The contract
 *
 * One base URL, configured globally as `TICKETING_API_URL`, speaking two calls:
 *
 *   POST {base}/tickets        { space, product, title }  ->  { id, status }
 *   GET  {base}/tickets/{id}                              ->  { id, status }
 *
 * `space` is the container a ticket is raised into — a Jira project key, or
 * whatever the tracker calls one. It is the map's stated space, falling back to
 * the product shortname. `product` rides along as context; `space` is the field
 * the adapter routes on, and the one that must not be guessed.
 *
 * `status` is one of the six slugs in src/lib/storymap/model.ts; anything else
 * is reported rather than guessed at.
 *
 * This is doc-sm's contract, not Jira's. Jira, GitHub and Azure DevOps each
 * spell issue creation differently and each want credentials, so pointing
 * `TICKETING_API_URL` straight at one of them will not work — the URL is
 * expected to name an adapter that speaks the two calls above and holds the
 * credentials on its own side. That keeps three things out of doc-sm that do not
 * belong in it: a vendor SDK, a secret, and an opinion about which tracker a
 * team uses.
 *
 * ## Why the calls go through this server
 *
 * Same reason the registry does: the browser must not be handed the ticketing
 * system's address, and an in-cluster URL is not reachable from one anyway. The
 * board posts to doc-sm's own `/api/ticket` route, which calls this.
 *
 * ## The ticketing system stays the truth
 *
 * Everything doc-sm stores about a ticket is a cache. The board can be edited
 * offline, a `.storymap` file can carry a status that is months stale, and the
 * preview can set one by hand — none of that changes a ticket. When the two
 * disagree, the ticketing system is right and doc-sm is out of date.
 */

import { isStoryStatus, type StoryStatus } from './storymap/model.ts';

const TIMEOUT_MS = 8_000;

export interface Ticket {
	readonly id: string;
	readonly status: StoryStatus;
}

/** Why a call did not produce a ticket. Never thrown; always returned. */
export interface TicketingFailure {
	readonly error: string;
	/** True when no ticketing system is configured at all, which is not a fault. */
	readonly unconfigured?: boolean;
}

export type TicketingResult = Ticket | TicketingFailure;

export function isFailure(result: TicketingResult): result is TicketingFailure {
	return 'error' in result;
}

/**
 * Whether a ticketing system has been configured.
 *
 * An unset URL is an ordinary state, not a misconfiguration: doc-sm is useful
 * with no tracker attached, and every board works without one. It is the reason
 * the "create a ticket" control is disabled with an explanation rather than
 * hidden or, worse, offered and then failing.
 */
export function isConfigured(baseUrl: string): boolean {
	return baseUrl.trim() !== '';
}

export async function createTicket(
	baseUrl: string,
	input: { space: string | null; product: string | null; title: string },
): Promise<TicketingResult> {
	if (!isConfigured(baseUrl)) {
		return { error: 'No ticketing system is configured.', unconfigured: true };
	}
	// A ticket is raised into a space. With no product and no stated space there
	// is nothing to raise it into, so it is refused here rather than sent as null
	// — the failure names the fix.
	if (input.space === null) {
		return { error: 'Set a ticketing space, or pick a product to take it from.' };
	}

	return await call(`${base(baseUrl)}/tickets`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', accept: 'application/json' },
		body: JSON.stringify(input),
	});
}

export async function fetchTicket(baseUrl: string, id: string): Promise<TicketingResult> {
	if (!isConfigured(baseUrl)) {
		return { error: 'No ticketing system is configured.', unconfigured: true };
	}
	return await call(`${base(baseUrl)}/tickets/${encodeURIComponent(id)}`, {
		headers: { accept: 'application/json' },
	});
}

function base(baseUrl: string): string {
	return baseUrl.trim().replace(/\/+$/, '');
}

async function call(url: string, init: RequestInit): Promise<TicketingResult> {
	let response: Response;
	try {
		response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
	} catch {
		return { error: 'Could not reach the ticketing system.' };
	}

	if (!response.ok) {
		return { error: `The ticketing system answered ${response.status} ${response.statusText}.` };
	}

	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		return { error: 'The ticketing system sent something that is not JSON.' };
	}

	return toTicket(payload);
}

/**
 * Coerce a response into a ticket, defensively.
 *
 * Same posture as doc-portal's registry coercion: every field is checked, and a
 * shape that does not match is an error rather than a partly-filled object. An
 * unrecognised status in particular is *not* silently downgraded to `open` — a
 * story that a tracker calls "Awaiting UAT" is not open, and saying so would be
 * a false statement about somebody's work.
 */
function toTicket(payload: unknown): TicketingResult {
	if (typeof payload !== 'object' || payload === null) {
		return { error: 'The ticketing system sent something that is not a ticket.' };
	}

	const { id, status } = payload as { id?: unknown; status?: unknown };

	if (typeof id !== 'string' || id.trim() === '') {
		return { error: 'The ticketing system did not return a ticket id.' };
	}
	if (!isStoryStatus(status)) {
		return {
			error: `The ticketing system returned a status doc-sm does not know: ${String(status)}.`,
		};
	}

	return { id: id.trim(), status };
}
