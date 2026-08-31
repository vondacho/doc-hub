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
	/** A sun — the board in daylight. */
	sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M6 6 4.5 4.5M19.5 19.5 18 18M18 6l1.5-1.5M4.5 19.5 6 18M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
	/** A crescent moon — the board at night. */
	moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z',
	/** A floppy disk, still the only glyph everybody reads as "save". */
	save: 'M5 3h11l3 3v15H5zM8 3v6h8V3M8 14h8v7H8z',
	/** A folder — the boards this browser is keeping. */
	folder: 'M3 6h6l2 3h10v10H3zM3 6v13',
	/** A milestone flag — a release, as distinct from a sprint's plain band. */
	flag: 'M6 21V4h11l-2 4 2 4H6',
	/*
	 * Two swatches and the words beside them: a key, which is what a legend is.
	 *
	 * The same shape ba-ddd-mapper draws for the same button, redrawn on this
	 * grid — the toggle exists in both lineages now, and a control that means the
	 * same thing should look the same in both.
	 */
	legend: 'M4 5h5v5H4zM4 14h5v5H4zM12 7.5h8M12 16.5h8',
	/*
	 * A drum: the database glyph everybody reads as "stored", which is what this
	 * browser's copy is. ba-ddd-mapper draws the same shape for the same button.
	 * An arc rather than an ellipse element, because every icon here is one path.
	 */
	store: 'M4 6c0-1.1 3.6-2 8-2s8 .9 8 2-3.6 2-8 2-8-.9-8-2M4 6v12c0 1.1 3.6 2 8 2s8-.9 8-2V6M4 12c0 1.1 3.6 2 8 2s8-.9 8-2',
	/*
	 * Lines stepped in from a margin: the shape of an indented block, which is
	 * the whole of what Format does to the text. ba-ddd-mapper's glyph, redrawn
	 * on this grid.
	 */
	format: 'M4 5h16M8 9.5h12M8 14.5h12M4 19h16M5.5 9.5v5',
	/** A blank sheet with a plus: a document that does not exist yet. */
	newDoc: 'M6 3h8l4 4v14H6zM14 3v4h4M12 11v6M9 14h6',
	panesBoth: 'M3 5h18v14H3zM12 5v14',
	panesSource: 'M3 5h18v14H3zM6 9h12M6 12h9M6 15h12',
	panesBoard: 'M3 5h18v14H3zM6 9h5v5H6zM14 9h4v4h-4z',
	/*
	 * A speech mark with a spark in it: something that answers, and is not a
	 * person. ba-ddd-mapper's `agent` glyph, redrawn on this grid as one path —
	 * the bubble and the spark are two subpaths of it, which is how every other
	 * multi-part icon here is drawn.
	 */
	agent: 'M20 4H4v11h4v4l4-4h8V4Z M12 7l.8 2.2L15 10l-2.2.8L12 13l-.8-2.2L9 10l2.2-.8L12 7Z',
} as const;

export type IconName = keyof typeof icons;
