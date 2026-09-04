/**
 * Every move, without a mouse.
 *
 * Drag is never the only way to do anything on this board. That is partly an
 * accessibility position — doc-portal uses skip links, `aria-labelledby`,
 * `sr-only` headings and `motion-reduce:` throughout, and a mouse-only board
 * would be the least accessible thing in doc-hub — and partly just true: there
 * is no gesture for "make this story a step", so a menu has to exist anyway.
 *
 * A disabled item always says why. A greyed-out control with no explanation is
 * indistinguishable from a bug, and the reasons here are real constraints from
 * canChangeKind() in src/lib/board/reducer.ts, not arbitrary policy. The reason
 * is wired through `aria-describedby` rather than a `title` attribute, because a
 * `title` is invisible to anyone navigating by keyboard.
 *
 * ## The open menu is rendered in a portal
 *
 * It used to be an absolutely positioned child of the card, and it disappeared
 * under the row below: the header rows are `position: sticky`, and a sticky
 * element creates a stacking context, so **no z-index on a child can lift it out
 * of its own card**. An activity's menu was painted under the step cards
 * beneath it, every time.
 *
 * The board is also an `overflow: auto` scroll container, which clips any child
 * that reaches past its edge — the same trap that makes DragOverlay mandatory in
 * StoryMapBoard.
 *
 * Both go away if the menu is not a child at all. It is portalled out and
 * positioned `fixed` against the button's own rectangle, so it paints above
 * everything and is clipped by nothing.
 *
 * The portal target is the fullscreen element when there is one, and the body
 * otherwise: content outside the fullscreen element is not painted at all, so a
 * menu portalled to the body would vanish the moment somebody went fullscreen.
 *
 * ## The portal is why the menu needs its own arrow keys
 *
 * Being rendered into the body puts the menu at the end of the document, and
 * the tab sequence follows the document. So Tab from the button did not step
 * into the menu it had just opened — it stepped to the next note on the wall,
 * leaving an open menu behind that nothing could reach. A menu that exists so
 * that every move works without a mouse was, once open, the one thing on the
 * board a keyboard could not use.
 *
 * The fix is the pattern menus are supposed to use anyway, and the portal only
 * makes it compulsory: focus moves *into* the menu when it opens from the
 * keyboard, the arrows walk it, and Escape puts focus back on the button it
 * came from. Tab closes rather than tabbing through the items, because a menu
 * is one stop in the tab sequence and its contents are reached with the arrows.
 *
 * ## Disabled items stay focusable
 *
 * `aria-disabled`, not the `disabled` attribute. A disabled button cannot be
 * focused, so the arrows would have to step over it — and then the reason it
 * carries would be unreachable by exactly the person the note above says it is
 * there for. The item is skipped as a *target* by nothing and refused as an
 * *action* by the click handler, which is the arrangement that lets somebody
 * arrow onto "Move up", hear that it is already first, and move on.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface CardMenuAction {
	readonly label: string;
	readonly run?: () => void;
	/** Present when the action is unavailable; shown, and read out. */
	readonly disabledReason?: string;
	/** Draws a rule above this item. */
	readonly separated?: boolean;
}

/**
 * Wide enough for the longest label, narrow enough to sit beside a card.
 *
 * 246 is the old 224 plus a tenth. The labels grew as the rows did — "Create a
 * capability", "Unlink from its capability", "Mark In progress here only" — and
 * a menu that wraps its own items reads as broken rather than as full.
 *
 * One number: the width is an inline style on the portalled menu, not a class,
 * because the position it is placed at is computed from it.
 */
const MENU_WIDTH = 246;
const GAP = 4;
const EDGE = 8;

/*
 * Enough to guess the menu's height before it exists.
 *
 * Measured off the rendered rules rather than invented: py-1.5 plus a line at
 * text-sm is about 30px an item, a disabled item's reason adds a text-xs line,
 * and a separator adds its rule and margin. It only has to be close — it decides
 * which side to open on, not where anything lands.
 */
const ITEM_HEIGHT = 30;
const REASON_HEIGHT = 18;
const SEPARATOR_HEIGHT = 9;
const MENU_PADDING = 8;

export function CardMenu({ label, actions }: { label: string; actions: readonly CardMenuAction[] }) {
	const [open, setOpen] = useState(false);
	const [at, setAt] = useState<{ top: number; left: number } | null>(null);
	// The menu's real height, once it has one. Until then the estimate stands in.
	const [height, setHeight] = useState(0);
	const button = useRef<HTMLButtonElement>(null);
	const menu = useRef<HTMLUListElement>(null);
	const menuId = useId();
	/**
	 * Which end to enter from, or `null` when a pointer opened the menu.
	 *
	 * A mouse leaves focus where it was — the pointer is the thing doing the
	 * pointing, and dragging focus about behind it helps nobody. A key press has
	 * nowhere else to be, so it goes in at the top, or at the bottom for the
	 * up-arrow, which is what makes "open it and press up" reach the last item in
	 * two keys rather than nine.
	 */
	const entering = useRef<'first' | 'last' | null>(null);

	/** The items, in order. All of them: a disabled one is still a stop. */
	const items = useCallback(
		() => [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])],
		[],
	);

	/** Close, and put focus back where the menu was opened from. */
	const close = useCallback(() => {
		setOpen(false);
		// Optional, and not always there: an action may have just removed the very
		// card this button belongs to.
		button.current?.focus();
	}, []);

	/*
	 * Place the whole menu on the screen.
	 *
	 * It has no scrollbar of its own, on purpose. One inside a menu is a trap:
	 * the page-scroll listener that dismisses the menu cannot tell a wheel over
	 * the menu from a wheel over the board, so reaching for the scrollbar closed
	 * the very thing you were reaching into.
	 *
	 * So instead of capping the height and letting it scroll, the position is
	 * chosen so nothing is ever out of reach: below the button by preference,
	 * above it when it will not fit below, and clamped into the viewport when it
	 * fits neither way — which detaches it from the button slightly, and is far
	 * better than a menu with items nobody can get to.
	 */
	const place = (known: number) => {
		const rect = button.current?.getBoundingClientRect();
		if (!rect) return;

		// Right-aligned to the button, then pulled back inside the viewport — a
		// card near the right edge would otherwise open off-screen.
		const left = Math.max(EDGE, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - EDGE));

		/*
		 * The estimate only has to hold until the menu exists and can be measured.
		 * Measured off the rendered rules rather than invented: py-1.5 plus a line
		 * at text-sm is about 30px an item, a disabled item's reason adds a
		 * text-xs line, and a separator adds its rule and margin.
		 */
		const tall =
			known ||
			MENU_PADDING +
				actions.reduce(
					(total, action) =>
						total +
						ITEM_HEIGHT +
						(action.disabledReason === undefined ? 0 : REASON_HEIGHT) +
						(action.separated === true ? SEPARATOR_HEIGHT : 0),
					0,
				);

		let top = rect.bottom + GAP;
		// Above, as soon as it would not fit below — which for a story's fifteen
		// entries is a good deal higher up the screen than for a menu of three.
		if (top + tall > window.innerHeight - EDGE) top = rect.top - GAP - tall;
		// And inside the viewport regardless, for the case where neither side has
		// the room.
		top = Math.max(EDGE, Math.min(top, window.innerHeight - tall - EDGE));

		setAt((was) => (was?.top === top && was.left === left ? was : { top, left }));
	};

	// Before paint, so the menu never appears at the wrong place first.
	useLayoutEffect(() => {
		if (open) place(0);
		else setHeight(0);
	}, [open]);

	// Then again with the height it turned out to have. The estimate is close
	// enough that this rarely moves anything, and exact enough when it does.
	useLayoutEffect(() => {
		if (!open) return;
		const measured = menu.current?.offsetHeight ?? 0;
		if (measured === 0 || measured === height) return;
		setHeight(measured);
		place(measured);
	}, [open, at, height]);

	/*
	 * Step into the menu, once it exists and has been put somewhere.
	 *
	 * After `at` rather than after `open`, because the menu is not rendered until
	 * it has a position — focusing an item before that would be focusing nothing.
	 */
	useLayoutEffect(() => {
		if (!open || at === null || entering.current === null) return;
		const list = items();
		const target = entering.current === 'first' ? list[0] : list[list.length - 1];
		entering.current = null;
		target?.focus();
	}, [open, at, items]);

	useEffect(() => {
		if (!open) return;

		const onPointer = (event: PointerEvent) => {
			const target = event.target as Node;
			// The menu is not inside the button's subtree any more, so both have to
			// be asked before deciding this was a click outside.
			if (button.current?.contains(target) || menu.current?.contains(target)) return;
			setOpen(false);
		};
		// On the document, so it answers wherever focus happens to be — on an item,
		// on the button, or nowhere in particular after a pointer opened it.
		const onKey = (event: globalThis.KeyboardEvent) => {
			if (event.key === 'Escape') close();
		};
		// A fixed menu does not travel with the card, so it is dismissed rather
		// than left hanging beside whatever scrolled into its place — but never
		// because of a scroll that started inside the menu itself.
		const onMove = (event: Event) => {
			if (event.target instanceof Node && menu.current?.contains(event.target)) return;
			setOpen(false);
		};

		document.addEventListener('pointerdown', onPointer);
		document.addEventListener('keydown', onKey);
		window.addEventListener('resize', onMove);
		window.addEventListener('scroll', onMove, true);
		return () => {
			document.removeEventListener('pointerdown', onPointer);
			document.removeEventListener('keydown', onKey);
			window.removeEventListener('resize', onMove);
			window.removeEventListener('scroll', onMove, true);
		};
	}, [open, close]);

	return (
		<>
			<button
				ref={button}
				type="button"
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={open ? menuId : undefined}
				aria-label={`Actions for ${label}`}
				onClick={() => setOpen((was) => !was)}
				/*
				 * Enter, Space and the arrows open it *and* step inside.
				 *
				 * `preventDefault` on Enter and Space matters for more than scrolling:
				 * both synthesise a click on a button, so without it this would open
				 * the menu and the click would immediately toggle it shut again.
				 *
				 * Down enters at the top and Up at the bottom, which is the ordinary
				 * menu-button bargain and is worth keeping for the last item — "Remove
				 * this note" sits at the end of every one of these menus.
				 */
				onKeyDown={(event) => {
					const opening =
						event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown' || event.key === 'ArrowUp';
					if (!opening) return;
					event.preventDefault();
					if (open) {
						close();
						return;
					}
					entering.current = event.key === 'ArrowUp' ? 'last' : 'first';
					setOpen(true);
				}}
				// Always reachable by keyboard; only revealed on hover for pointers,
				// so a dense board is not a field of dots.
				className="shrink-0 rounded-sm px-[0.15em] leading-none opacity-0 transition group-hover:opacity-70 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand motion-reduce:transition-none"
			>
				<span aria-hidden="true">&#8942;</span>
			</button>

			{open && at !== null && createPortal(
				<ul
					ref={menu}
					id={menuId}
					role="menu"
					/*
					 * The board's light/dark override, carried across the portal.
					 *
					 * `dark:` resolves against the nearest ancestor carrying
					 * `data-theme`, and this element has none — it is rendered into the
					 * body, not into the board. Without this a menu opened from a board
					 * that had been switched to daylight would come up in the page's
					 * dark palette, which looks exactly like a bug.
					 *
					 * Read off the trigger rather than passed in as a prop: the button
					 * *is* inside the board, so it already knows the answer, and every
					 * one of this component's several callers would otherwise have to
					 * thread a value none of them cares about.
					 */
					data-theme={button.current?.closest('[data-theme]')?.getAttribute('data-theme') ?? undefined}
					style={{
						position: 'fixed',
						top: at.top,
						left: at.left,
						width: MENU_WIDTH,
					}}
					// `text-ink dark:text-slate-100` for the same reason `data-theme` is
					// here: this element is in the body, so anything it does not colour
					// itself inherits from a `<body>` that follows the operating system
					// rather than the board. A menu opened from a board pinned to
					// daylight on a dark machine would otherwise be near-white on white.
					className="z-[1000] rounded-lg border border-slate-200 bg-white py-1 text-left text-sm text-ink shadow-lg dark:border-slate-700 dark:bg-night-raised dark:text-slate-100"
					/*
					 * On the list, not on each item: the keys mean the same thing
					 * wherever in the menu they are pressed, and one handler that reads
					 * the current item off `document.activeElement` cannot fall out of
					 * step with a list that has just been rebuilt.
					 *
					 * The walk wraps. A menu is a ring of a handful of items with both
					 * ends in view, so there is no "off the end" to be lost at — and
					 * wrapping is what makes Up the shortest way to the last item.
					 *
					 * Escape is not here. It is on the document, because it has to work
					 * when a pointer opened the menu and focus never came inside.
					 */
					onKeyDown={(event) => {
						const list = items();
						if (list.length === 0) return;
						const here = list.indexOf(document.activeElement as HTMLButtonElement);

						if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
							event.preventDefault();
							const by = event.key === 'ArrowDown' ? 1 : -1;
							// From nowhere, the two arrows mean the two ends.
							const next = here < 0 ? (by === 1 ? 0 : list.length - 1) : (here + by + list.length) % list.length;
							list[next]?.focus();
							return;
						}
						if (event.key === 'Home' || event.key === 'End') {
							event.preventDefault();
							(event.key === 'Home' ? list[0] : list[list.length - 1])?.focus();
							return;
						}
						/*
						 * Tab closes and comes back to the button rather than walking the
						 * items, because a menu is one stop in the tab sequence.
						 *
						 * The strictly correct thing is to move on to whatever follows the
						 * button, and it is not worth what it costs here: the menu lives in
						 * a portal at the end of the document, so "whatever follows" would
						 * have to be worked out by hand across two trees. Landing on the
						 * button costs one more Tab and cannot land nowhere.
						 */
						if (event.key === 'Tab') {
							event.preventDefault();
							close();
						}
					}}
				>
					{actions.map((action, index) => {
						const reasonId = `${menuId}-r${index}`;
						const disabled = action.disabledReason !== undefined;
						return (
							<li
								key={action.label}
								role="none"
								className={action.separated ? 'mt-1 border-t border-slate-200 pt-1 dark:border-slate-700' : undefined}
							>
								<button
									type="button"
									role="menuitem"
									// `aria-disabled`, so the arrows can still land here and the
									// reason below can still be read out. See the note at the top.
									aria-disabled={disabled || undefined}
									aria-describedby={disabled ? reasonId : undefined}
									onClick={() => {
										if (disabled) return;
										close();
										action.run?.();
									}}
									className="block w-full px-3 py-1.5 text-left hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none aria-disabled:cursor-not-allowed aria-disabled:text-ink-muted aria-disabled:hover:bg-transparent dark:hover:bg-white/10 dark:focus-visible:bg-white/10 dark:aria-disabled:text-slate-500"
								>
									{action.label}
								</button>
								{disabled && (
									<p id={reasonId} className="px-3 pb-1 text-xs text-ink-muted dark:text-slate-400">
										{action.disabledReason}
									</p>
								)}
							</li>
						);
					})}
				</ul>,
				document.fullscreenElement ?? document.body,
			)}
		</>
	);
}
