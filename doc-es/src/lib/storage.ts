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
 * recoverable by hand: it is a `.eventstorm` file that happens to live in
 * `localStorage`, so somebody can copy it out of devtools and it is simply the
 * file.
 *
 * It also means an entry written by an older version of doc-es is read by the
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
const LAST_OPENED = 'doc-es:last-opened';

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
const BOARD_THEME = 'doc-es:board-theme';

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
