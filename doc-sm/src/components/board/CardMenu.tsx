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
 */

import { useEffect, useId, useRef, useState } from 'react';

export interface CardMenuAction {
	readonly label: string;
	readonly run?: () => void;
	/** Present when the action is unavailable; shown, and read out. */
	readonly disabledReason?: string;
	/** Draws a rule above this item. */
	readonly separated?: boolean;
}

export function CardMenu({ label, actions }: { label: string; actions: readonly CardMenuAction[] }) {
	const [open, setOpen] = useState(false);
	const container = useRef<HTMLDivElement>(null);
	const menuId = useId();

	useEffect(() => {
		if (!open) return;
		const onPointer = (event: PointerEvent) => {
			if (!container.current?.contains(event.target as Node)) setOpen(false);
		};
		const onKey = (event: globalThis.KeyboardEvent) => {
			if (event.key === 'Escape') setOpen(false);
		};
		document.addEventListener('pointerdown', onPointer);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('pointerdown', onPointer);
			document.removeEventListener('keydown', onKey);
		};
	}, [open]);

	return (
		<div ref={container} className="absolute top-1 right-1">
			<button
				type="button"
				aria-haspopup="menu"
				aria-expanded={open}
				aria-controls={open ? menuId : undefined}
				aria-label={`Actions for ${label}`}
				onClick={() => setOpen((was) => !was)}
				// Always reachable by keyboard; only revealed on hover for pointers,
				// so a dense board is not a field of dots.
				className="rounded-sm px-1 text-xs leading-none opacity-0 transition group-hover:opacity-70 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand motion-reduce:transition-none"
			>
				<span aria-hidden="true">&#8942;</span>
			</button>

			{open && (
				<ul
					id={menuId}
					role="menu"
					className="absolute right-0 z-40 mt-1 w-56 rounded-lg border border-slate-200 bg-white py-1 text-left text-sm shadow-lg dark:border-slate-700 dark:bg-night-raised"
				>
					{actions.map((action, index) => {
						const reasonId = `${menuId}-r${index}`;
						const disabled = action.disabledReason !== undefined;
						return (
							<li key={action.label} role="none" className={action.separated ? 'mt-1 border-t border-slate-200 pt-1 dark:border-slate-700' : undefined}>
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
				</ul>
			)}
		</div>
	);
}
