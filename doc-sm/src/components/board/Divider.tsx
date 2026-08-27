/**
 * The drag handle between the source and the board.
 *
 * Keyboard-operable, because a mouse-only split is a trap: the panel it sizes
 * holds a textarea, and somebody who reaches that textarea by tabbing has no
 * other way to make room for it. Arrow keys jump to the two proportions worth
 * having rather than nudging by a pixel — a split is a layout decision, not a
 * value to be dialled in.
 *
 * ba-ddd-mapper's, ported unchanged apart from the colours.
 */

import { useEffect, useRef } from 'react';

export function Divider({ onMove }: { onMove: (percent: number) => void }) {
	const dragging = useRef(false);

	useEffect(() => {
		const move = (event: PointerEvent) => {
			if (!dragging.current) return;
			const percent = (event.clientX / window.innerWidth) * 100;
			onMove(Math.min(75, Math.max(20, percent)));
		};
		const up = () => {
			dragging.current = false;
		};
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', up);
		return () => {
			window.removeEventListener('pointermove', move);
			window.removeEventListener('pointerup', up);
		};
	}, [onMove]);

	return (
		<div
			role="separator"
			aria-label="Resize panels"
			aria-orientation="vertical"
			tabIndex={0}
			onPointerDown={() => {
				dragging.current = true;
			}}
			onKeyDown={(event) => {
				if (event.key === 'ArrowLeft') onMove(30);
				if (event.key === 'ArrowRight') onMove(60);
			}}
			className="hidden w-1.5 shrink-0 cursor-col-resize bg-slate-200 transition-colors hover:bg-brand focus-visible:bg-brand focus-visible:outline-none motion-reduce:transition-none lg:block dark:bg-slate-700"
		/>
	);
}
