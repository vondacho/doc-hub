/**
 * The icon set, as SVG path data.
 *
 * Hand-written paths in a module, not an icon library — the same convention
 * doc-portal follows, where `src/lib/product-sections.ts` and
 * `src/lib/indicators.ts` each hold their glyphs as a single `d` string. A
 * dependency that ships a thousand icons to use nine of them would be the
 * largest thing in this component's bundle.
 *
 * All of them are drawn on a 24×24 grid, stroked rather than filled, so they
 * inherit `currentColor` and sit correctly beside text at any size. Several use
 * more than one subpath in one `d` — that is why `M` appears mid-string.
 *
 * ## These icons are never the only signal
 *
 * The rule the status palette carries in global.css — colour is never the only
 * signal — applies to shape for the same reason. Every icon button in doc-sm has
 * an `aria-label`, and a tooltip that appears on hover **and on keyboard focus**.
 * An icon-only control with neither is a control that only its author can use,
 * and "add activity" versus "add release" is exactly the distinction a glyph
 * conveys worst.
 */

export const icons = {
	/** Curved arrow, anticlockwise. */
	undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
	/** The same, mirrored. */
	redo: 'm15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',

	/*
	 * Add-activity and add-release are the pair most at risk of reading alike, so
	 * each one draws the shape it creates: a column for an activity, a band for a
	 * release. Tooltip and label carry the meaning; the glyph only has to keep
	 * them apart at a glance.
	 */
	addActivity: 'M4 4h5v16H4zM14 12h6M17 9v6',
	addRelease: 'M4 4h16v5H4zM9 15h6M12 12v6',

	/** A page with a folded corner — the worked example. */
	example: 'M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h4',

	/** Arrow down into a tray. */
	importFile: 'M12 3v10m0 0 4-4m-4 4-4-4M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3',
	/** Arrow up out of a tray. */
	exportFile: 'M12 14V4m0 0 4 4m-4-4-4 4M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3',

	/** An eye — look at the file without producing one. */
	preview: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',

	/** Two sheets, one behind the other. */
	copy: 'M9 9h10v11H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
	/** Confirmation, shown briefly in place of the copy glyph. */
	check: 'm4 12 5 5L20 6',

	/** Arrow coming down onto a surface — put this text into the board. */
	apply: 'M12 3v12m0 0 4-4m-4 4-4-4M4 19h16',

	/** Paper aeroplane — send these out of doc-sm, into the tracker. */
	publish: 'M21 3 3 10.5l7 3 3 7L21 3ZM10 14l4-4',

	/** Chevrons apart — open everything. */
	expandAll: 'M8 9.5 12 5.5l4 4M8 14.5l4 4 4-4',
	/** Chevrons together — close everything. */
	collapseAll: 'M8 5.5l4 4 4-4M8 18.5l4-4 4 4',

	zoomIn: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20.5 20.5 16 16M11 8.5v5M8.5 11h5',
	zoomOut: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20.5 20.5 16 16M8.5 11h5',
	/** Four corners pushing out. */
	fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
	/** The same four pulling back in. */
	fullscreenExit: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',

	close: 'M6 6l12 12M18 6 6 18',
	plus: 'M12 5v14M5 12h14',
	up: 'm18 15-6-6-6 6',
	down: 'm6 9 6 6 6-6',
	trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
	/** A milestone flag — a release, as distinct from a sprint's plain band. */
	flag: 'M6 21V4h11l-2 4 2 4H6',
} as const;

export type IconName = keyof typeof icons;
