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
 */

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
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

export function CardMenu({ label, actions }: { label: string; actions: readonly CardMenuAction[] }) {
	const [open, setOpen] = useState(false);
	const [at, setAt] = useState<{ top: number; left: number; flip: boolean } | null>(null);
	const button = useRef<HTMLButtonElement>(null);
	const menu = useRef<HTMLUListElement>(null);
	const menuId = useId();

	const place = () => {
		const rect = button.current?.getBoundingClientRect();
		if (!rect) return;
		// Right-aligned to the button, then pulled back inside the viewport — a
		// card near the right edge would otherwise open off-screen.
		const left = Math.max(EDGE, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - EDGE));
		// Below normally; above when there is more room there, which is what
		// happens for the bottom row of a long board.
		const flip = rect.bottom > window.innerHeight * 0.6;
		setAt({ top: flip ? rect.top - GAP : rect.bottom + GAP, left, flip });
	};

	// Before paint, so the menu never appears at the wrong place first.
	useLayoutEffect(() => {
		if (open) place();
	}, [open]);

	useEffect(() => {
		if (!open) return;

		const onPointer = (event: PointerEvent) => {
			const target = event.target as Node;
			// The menu is not inside the button's subtree any more, so both have to
			// be asked before deciding this was a click outside.
			if (button.current?.contains(target) || menu.current?.contains(target)) return;
			setOpen(false);
		};
		const onKey = (event: globalThis.KeyboardEvent) => {
			if (event.key === 'Escape') setOpen(false);
		};
		// A fixed menu does not travel with the card, so it is dismissed rather
		// than left hanging beside whatever scrolled into its place.
		const onMove = () => setOpen(false);

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
	}, [open]);

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
					style={{
						position: 'fixed',
						top: at.top,
						left: at.left,
						width: MENU_WIDTH,
						// Translated up by its own height when flipped, which needs no
						// measurement and cannot be wrong.
						transform: at.flip ? 'translateY(-100%)' : undefined,
					}}
					className="z-[1000] max-h-[60vh] overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-left text-sm shadow-lg dark:border-slate-700 dark:bg-night-raised"
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
									disabled={disabled}
									aria-describedby={disabled ? reasonId : undefined}
									onClick={() => {
										setOpen(false);
										action.run?.();
									}}
									className="block w-full px-3 py-1.5 text-left hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none disabled:cursor-not-allowed disabled:text-ink-muted disabled:hover:bg-transparent dark:hover:bg-white/10 dark:focus-visible:bg-white/10 dark:disabled:text-slate-500"
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
