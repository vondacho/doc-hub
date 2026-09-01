/**
 * Keeping a board in this browser, between visits.
 *
 * The board has always been a file: you import one, you export one, and nothing
 * is stored on the server. That is still true. What was missing is the middle —
 * close the tab before exporting and the session was gone, which is a harsh
 * thing to do to a workshop that ran for an hour.
 *
 * So the browser keeps a copy. `localStorage`, not a server: the map is still
 * yours, still never sent anywhere, and still not shared with anybody. Nothing
 * here changes what the component promises about privacy; it changes what
 * happens when a laptop sleeps.
 *
 * ## What is stored is the file, and nothing else
 *
 * Each entry is exactly the text `serialize()` produces — the same bytes the
 * export button hands you. Not the board model, not JSON with the board inside
 * it, not a version envelope.
 *
 * That is the whole design, and it buys three things. The format already
 * round-trips, so a restored board is a parsed file and cannot be a shape the
 * parser has never seen. There is no second serialisation to keep in step with
 * the first when the model changes. And a stored entry is readable and
 * recoverable by hand: it is a `.examplemap` file that happens to live in
 * `localStorage`, so somebody can copy it out of devtools and it is simply the
 * file.
 *
 * It also means an entry written by an older version of doc-em is read by the
 * same parser that reads an old file off disk — which already handles being old,
 * because files on disk are.
 *
 * ## Every call is guarded
 *
 * `localStorage` throws rather than returning null in two ordinary situations:
 * Safari in private browsing, and a full quota. Neither is a fault worth
 * breaking a board over — the board works perfectly well without persistence,
 * exactly as it did before this module existed. So every entry point catches,
 * and the failure is in the return value where a caller has to look at it.
 */

/** The extension is not part of the key; `storageKey` is the filename's stem. */
const LAST_OPENED = 'doc-em:last-opened';

/**
 * The board's own light/dark override, when the visitor has set one.
 *
 * A view preference rather than a board, which is why it is kept here beside
 * `LAST_OPENED` rather than under a board key: it belongs to this browser, not
 * to any one storm, and it survives opening a different one.
 *
 * Colons, like `LAST_OPENED`, precisely so it can never collide with a board key
 * or be listed as one — `storageKey` only ever produces `[a-z0-9-]` and one
 * underscore.
 */
const BOARD_THEME = 'doc-em:board-theme';
const LEGEND = 'doc-em:legend';
const PANES = 'doc-em:panes';
const SPLIT = 'doc-em:split';
const EDITOR_TEXT = 'doc-em:editor-text';

/**
 * The assistant: whether the panel is open, how it is configured, and the key.
 *
 * Three entries rather than one, because they have three different lifetimes.
 * Whether the panel is open is a view preference like `PANES`. The
 * configuration is a set of choices that survive clearing the key. The key is a
 * secret the visitor typed, and lives in whichever store they chose — see
 * `loadKey`.
 *
 * Colons, like every setting here, so none of them can collide with a board key
 * or be listed as one.
 */
const AGENT = 'doc-em:agent';
const AGENT_WIDTH = 'doc-em:agent-width';
const AGENT_CONFIG = 'doc-em:agent-config';
const AGENT_KEY = 'doc-em:agent-key';

/**
 * Where a board is kept: `<product>_<title>`.
 *
 * The same stem the export filename uses, so the entry in `localStorage` and the
 * file on disk are recognisably the same board. That is the point of composing
 * it this way rather than using a uuid: a person looking at devtools, or at a
 * downloads folder, sees one name.
 *
 * Both halves are slugged, because a key with a slash or a quote in it is a key
 * somebody has to escape before they can grep for it, and titles are free text.
 *
 * A map about no registered product is named by its title alone — no prefix and
 * no separator, and no `no-product` placeholder. Not being about a registered
 * product is an ordinary state rather than a missing value, and a stand-in would
 * make every unregistered board sort together under a word nobody chose.
 */
export function storageKey(product: string | null, title: string): string {
	const name = slug(title, 'untitled');
	const owner = product === null ? '' : slug(product, '');
	return owner === '' ? name : `${owner}_${name}`;
}

/**
 * A slug for one half of a key: lowercase, ASCII, hyphen-separated.
 *
 * An allowlist rather than a list of characters to strip. Path separators and
 * control characters are what actually break a *filename*, but enumerating
 * everything a title might contain is a losing game — titles are free text and
 * may be in any script.
 *
 * Truncated, so a paragraph pasted into the title box cannot produce a key
 * longer than the thing it names.
 */
export function slug(text: string, fallback: string): string {
	const out = text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 60)
		.replace(/-+$/, '');
	return out === '' ? fallback : out;
}

/**
 * Whether a `localStorage` key is one of ours.
 *
 * `storageKey` only ever produces this shape, so anything else at this origin
 * belongs to something else and is left alone — including `LAST_OPENED`, which
 * carries a colon precisely so it can never collide with a board and never be
 * listed as one.
 */
const BOARD_KEY = /^[a-z0-9-]+(_[a-z0-9-]+)?$/;

/** Why a write did not happen. Never thrown; always returned. */
export interface StorageFailure {
	readonly error: string;
}

export type StorageResult = { readonly ok: true } | StorageFailure;

export function failed(result: StorageResult): result is StorageFailure {
	return 'error' in result;
}

/**
 * Read `localStorage`, or `null` when it cannot be read at all.
 *
 * Accessing the property itself throws in a blocked-cookies context, which is
 * why this is a function rather than a module-level constant — a constant would
 * throw at import time and take the whole island down.
 */
function store(): Storage | null {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

/** Store one board's file text. */
export function save(key: string, text: string): StorageResult {
	const storage = store();
	if (storage === null) return { error: 'This browser is not allowing local storage.' };

	try {
		storage.setItem(key, text);
		storage.setItem(LAST_OPENED, key);
		return { ok: true };
	} catch {
		// Overwhelmingly a full quota. Naming the fix is more use than naming the
		// exception, because the fix — delete a board you have already exported —
		// is one the person can actually carry out from the same dialog.
		return { error: 'There is no room left in this browser’s storage. Delete a saved board.' };
	}
}

/** One board's file text, or `null` when there is nothing under that key. */
export function load(key: string): string | null {
	const storage = store();
	if (storage === null) return null;
	try {
		return storage.getItem(key);
	} catch {
		return null;
	}
}

/**
 * Every saved board, newest name first is *not* what this returns.
 *
 * Alphabetical, because there is no timestamp to sort by — an entry is the file
 * and nothing else, and adding a `savedAt` would mean a second thing to keep in
 * step with the first for the sake of a sort order. Alphabetical by
 * `<product>_<title>` groups a product's boards together, which is the ordering
 * somebody scanning the list is actually using.
 */
export function saved(): readonly string[] {
	const storage = store();
	if (storage === null) return [];
	try {
		const keys: string[] = [];
		for (let i = 0; i < storage.length; i += 1) {
			const key = storage.key(i);
			if (key !== null && BOARD_KEY.test(key)) keys.push(key);
		}
		return keys.sort((a, b) => a.localeCompare(b));
	} catch {
		return [];
	}
}

export function remove(key: string): void {
	const storage = store();
	if (storage === null) return;
	try {
		storage.removeItem(key);
		if (storage.getItem(LAST_OPENED) === key) storage.removeItem(LAST_OPENED);
	} catch {
		// Nothing to do and nothing to say: the entry is either gone or was never
		// reachable, and both leave the caller in the state it wanted.
	}
}

/**
 * Move a board to a new key, keeping one entry rather than two.
 *
 * Renaming a board, or pointing it at a different product, changes where it
 * belongs. Without this the autosave would write the new key and leave the old
 * one behind — so a board renamed twice would appear three times in the open
 * dialog, two of them stale, and the person would have to work out which is
 * which from names that are all plausible.
 */
export function rename(from: string, to: string): void {
	if (from === to) return;
	const text = load(from);
	if (text === null) return;
	if (failed(save(to, text))) return;
	remove(from);
}

/** The board this browser had open last, or `null` on a first visit. */
export function lastOpened(): string | null {
	const storage = store();
	if (storage === null) return null;
	try {
		const key = storage.getItem(LAST_OPENED);
		return key !== null && storage.getItem(key) !== null ? key : null;
	} catch {
		return null;
	}
}

/**
 * Whether the board has been pinned to light or dark, or `null` to follow the
 * page.
 *
 * Three states rather than two, and the third is the default. A board that
 * started pinned would be overriding a choice the visitor made at the operating
 * system, which is a rude thing for one panel of one page to do — so it follows
 * along until somebody says otherwise, and then remembers that they did.
 */
export type BoardTheme = 'light' | 'dark';

export function loadTheme(): BoardTheme | null {
	const value = load(BOARD_THEME);
	return value === 'light' || value === 'dark' ? value : null;
}

export function saveTheme(theme: BoardTheme | null): void {
	const storage = store();
	if (storage === null) return;
	try {
		if (theme === null) storage.removeItem(BOARD_THEME);
		else storage.setItem(BOARD_THEME, theme);
	} catch {
		// A preference that could not be remembered is not worth telling anybody
		// about: the board is already showing what they asked for, and it will
		// simply not be showing it next time.
	}
}

/**
 * Whether the legend is showing.
 *
 * On unless somebody has turned it off, which is the right default for a
 * notation: the person who needs it most is the one who has not seen this board
 * before, and they are exactly the person who will not go looking for a switch.
 *
 * Stored as the *exception* rather than as a boolean — an absent key means on,
 * and only "off" is written. A visitor who has never touched the control leaves
 * nothing behind, and the day the default changes it changes for them too.
 */
export function loadLegend(): boolean {
	return load(LEGEND) !== 'off';
}

export function saveLegend(shown: boolean): void {
	const storage = store();
	if (storage === null) return;
	try {
		if (shown) storage.removeItem(LEGEND);
		else storage.setItem(LEGEND, 'off');
	} catch {
		// As above: nothing worth interrupting anybody for.
	}
}

/**
 * Which panels are on screen.
 *
 * Both by default: the board is what somebody came for and the source is what
 * it is made of, and hiding either on arrival would be choosing for them. The
 * setting is remembered because it is a working posture — somebody editing the
 * file wants the text wide, and they want it wide tomorrow too.
 */
export type Panes = 'both' | 'source' | 'board';

export function loadPanes(): Panes {
	const value = load(PANES);
	return value === 'source' || value === 'board' ? value : 'both';
}

export function savePanes(panes: Panes): void {
	const storage = store();
	if (storage === null) return;
	try {
		if (panes === 'both') storage.removeItem(PANES);
		else storage.setItem(PANES, panes);
	} catch {
		// As with the legend: a preference that could not be remembered is not
		// worth interrupting anybody for.
	}
}

/**
 * How wide the source pane is, as a percentage of the window.
 *
 * A percentage rather than pixels, so the split survives a window resize and a
 * move to another screen. Kept when a single pane is showing: the proportion is
 * about two panes and means nothing to one, so coming back to both restores what
 * was there rather than resetting to the default.
 */
export function loadSplit(): number {
	const value = Number(load(SPLIT));
	return Number.isFinite(value) && value >= 20 && value <= 75 ? value : 42;
}

export function saveSplit(percent: number): void {
	const storage = store();
	if (storage === null) return;
	try {
		storage.setItem(SPLIT, String(Math.round(percent)));
	} catch {
		// As above.
	}
}

/**
 * How big the source pane's type is, in px.
 *
 * Remembered for the same reason the panes and the split are: it is a working
 * posture rather than a property of a map. Somebody who needs 19px needs it in
 * every map they open, and on the map they open tomorrow — and being handed
 * 15px again on every reload is the kind of small refusal that makes a tool
 * unusable for the person who most needed the setting.
 *
 * Validated as a range rather than against the stops the toolbar offers, so a
 * scale that gains a step later does not orphan what a browser already holds.
 */
export function loadEditorText(): number {
	const value = Number(load(EDITOR_TEXT));
	return Number.isFinite(value) && value >= 12 && value <= 24 ? value : 15;
}

export function saveEditorText(px: number): void {
	const storage = store();
	if (storage === null) return;
	try {
		storage.setItem(EDITOR_TEXT, String(Math.round(px)));
	} catch {
		// As above.
	}
}

// ---------------------------------------------------------------------------
// What this browser is holding
// ---------------------------------------------------------------------------

/**
 * One stored board, as the store actually holds it.
 *
 * Simpler than ba-ddd-mapper's `StoredDocument`, and for a reason worth writing
 * down: that one is a *pair* — a `.ddd` beside its `.dddview` — because the map
 * keeps an arrangement the file cannot express, node positions and edge curves.
 * A wall has no such thing. Where a note sits is `@column`, which is in the
 * file, so a board is one entry and there is no sidecar to go missing.
 */
export interface StoredBoard {
	/** The storage key, which is also what the export is named after. */
	readonly key: string;
	/** UTF-16 units, key included — the unit the quota is counted in. */
	readonly bytes: number;
	/** The storm's title, read out of the text so the list is not just slugs. */
	readonly title: string | null;
}

export interface Inventory {
	readonly boards: readonly StoredBoard[];
	readonly bytes: number;
}

/**
 * The boards this origin holds, and only those.
 *
 * The one place that enumerates the store rather than addressing it by name.
 * Autosave is silent by design — it has to be, or it would be a dialog every
 * second — and the cost of that silence is a visitor who cannot say what has
 * accumulated under their own browser. This is the answer, and it is
 * deliberately a *reading*: nothing here writes and nothing here deletes.
 *
 * Boards only. The theme, the legend, the panes, the split, the source pane's
 * type size and the pointer to the last board opened all live in the store too, and none of them is a thing
 * anybody opens a panel to look at — they are settings, and a list that mixed
 * them in with somebody's work would be a dump of the store rather than an
 * account of it. They are excluded structurally rather than by a filter:
 * `BOARD_KEY` cannot match a key with a colon in it, and every setting has one.
 */
export function inventory(): Inventory {
	const storage = store();
	if (storage === null) return { boards: [], bytes: 0 };

	const boards: StoredBoard[] = [];
	let bytes = 0;

	try {
		for (let i = 0; i < storage.length; i += 1) {
			const key = storage.key(i);
			if (key === null || !BOARD_KEY.test(key)) continue;

			const text = storage.getItem(key) ?? '';
			const size = key.length + text.length;
			bytes += size;
			boards.push({ key, bytes: size, title: titleIn(text) });
		}
	} catch {
		// A store that throws mid-scan reports what it managed to read.
	}

	return { boards: boards.sort((a, b) => a.key.localeCompare(b.key)), bytes };
}

/**
 * The storm's title, by looking rather than by parsing.
 *
 * A regular expression over the first line that declares one, because this is a
 * list and not an editor: an entry that will not parse is exactly the entry
 * somebody opens this panel to find, and a reader that threw on it would hide
 * the one row that matters. Null when there is nothing to read, and the row
 * shows its key alone.
 */
function titleIn(text: string): string | null {
	const found = /^\s*examplemap\s+"((?:[^"\\]|\\.)*)"/m.exec(text);
	return found?.[1] === undefined ? null : found[1].replace(/\\(.)/g, '$1');
}


/* ---- the assistant ------------------------------------------------------ */

/** Whether the assistant panel is open, or null when nobody has said. */
export function loadAgent(): boolean | null {
	try {
		const value = store()?.getItem(AGENT);
		return value === 'on' ? true : value === 'off' ? false : null;
	} catch {
		return null;
	}
}

export function saveAgent(shown: boolean): void {
	try {
		store()?.setItem(AGENT, shown ? 'on' : 'off');
	} catch {
		// As with the theme: a preference that does not persist is survivable.
	}
}

/**
 * How wide the assistant sits, as a percentage of the window.
 *
 * Its own key rather than the split's, because they are two different
 * proportions: the split divides source from board, and this one takes a slice
 * off the end of whatever those two are showing. Sharing a number would move
 * one every time the visitor dragged the other.
 */
export const AGENT_DEFAULT_WIDTH = 30;
export const AGENT_MIN = 18;
export const AGENT_MAX = 60;

export function loadAgentWidth(): number {
	const value = Number(load(AGENT_WIDTH));
	return Number.isFinite(value) && value >= AGENT_MIN && value <= AGENT_MAX
		? value
		: AGENT_DEFAULT_WIDTH;
}

export function saveAgentWidth(percent: number): void {
	try {
		store()?.setItem(AGENT_WIDTH, String(Math.round(percent)));
	} catch {
		// As with the split: a proportion that does not persist is survivable.
	}
}

/**
 * How the assistant is configured — everything except the key.
 *
 * `remember` is about the key and lives here rather than with it, because it is
 * a decision the visitor made and the key is a secret they typed. Keeping the
 * two apart is what lets the key be dropped without forgetting the choice.
 */
export interface AgentConfig {
	readonly model: string;
	readonly effort: string;
	/** Standing instructions, appended to the guide. */
	readonly guidance: string;
	readonly remember: boolean;
}

export const AGENT_DEFAULTS: AgentConfig = {
	model: 'claude-opus-5',
	effort: 'high',
	guidance: '',
	remember: false,
};

export function loadAgentConfig(): AgentConfig {
	try {
		const raw = store()?.getItem(AGENT_CONFIG);
		if (!raw) return AGENT_DEFAULTS;
		const parsed = JSON.parse(raw) as Partial<AgentConfig>;
		return {
			model: typeof parsed.model === 'string' && parsed.model !== '' ? parsed.model : AGENT_DEFAULTS.model,
			effort: typeof parsed.effort === 'string' ? parsed.effort : AGENT_DEFAULTS.effort,
			guidance: typeof parsed.guidance === 'string' ? parsed.guidance : '',
			remember: parsed.remember === true,
		};
	} catch {
		// A corrupt entry is not worth a broken panel.
		return AGENT_DEFAULTS;
	}
}

export function saveAgentConfig(config: AgentConfig): void {
	try {
		store()?.setItem(AGENT_CONFIG, JSON.stringify(config));
	} catch {
		// Same.
	}
}

/**
 * The API key, in whichever store the visitor chose.
 *
 * **Two stores, one key, and the difference is the point.** `sessionStorage` is
 * this tab and goes when it closes; `localStorage` survives, and survives for
 * anything else that can run script on this origin. Neither is a secret vault
 * and the settings panel says so — a browser is where a local-first tool can
 * keep a key, and being told that plainly is the least this can do about it.
 *
 * Read from both regardless of the current preference, because the preference
 * can change after a key was stored and a key nobody can find is worse than
 * either choice.
 */
export function loadKey(): string {
	try {
		return window.sessionStorage.getItem(AGENT_KEY) ?? store()?.getItem(AGENT_KEY) ?? '';
	} catch {
		return '';
	}
}

export function saveKey(key: string, remember: boolean): void {
	try {
		window.sessionStorage.removeItem(AGENT_KEY);
		store()?.removeItem(AGENT_KEY);
		if (key === '') return;
		(remember ? store() : window.sessionStorage)?.setItem(AGENT_KEY, key);
	} catch {
		// A key that does not persist still works for this page's lifetime; the
		// panel holds it in memory too.
	}
}
