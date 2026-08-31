/**
 * The drag handle between two panes.
 *
 * Keyboard-operable, because a mouse-only split is a trap: the panels it sizes
 * hold a textarea, and somebody who reaches that textarea by tabbing has no
 * other way to make room for it. Arrow keys nudge rather than jump to two fixed
 * proportions — with two handles on the row, one of them sizing the assistant
 * off the right edge, a pair of stops cannot say what either of them means.
 *
 * `from` is which edge the percentage is measured against. The split between
 * source and board is a distance from the left; the assistant's width is a
 * slice off the right, and reading its handle the same way would have it grow
 * as the visitor dragged it inwards.
 *
 * ba-ddd-mapper's, ported apart from the colours.
 */

import { useEffect, useRef } from 'react';

export function Divider({
	percent,
	onMove,
	from = 'left',
	min = 20,
	max = 75,
	label = 'Resize panels',
}: {
	percent: number;
	onMove: (percent: number) => void;
	from?: 'left' | 'right';
	min?: number;
	max?: number;
	label?: string;
}) {
	const dragging = useRef(false);

	useEffect(() => {
		const move = (event: PointerEvent) => {
			if (!dragging.current) return;
			const along = from === 'left' ? event.clientX : window.innerWidth - event.clientX;
			onMove(Math.min(max, Math.max(min, (along / window.innerWidth) * 100)));
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
	}, [onMove, from, min, max]);

	return (
		<div
			role="separator"
			aria-label={label}
			aria-orientation="vertical"
			aria-valuenow={Math.round(percent)}
			aria-valuemin={min}
			aria-valuemax={max}
			tabIndex={0}
			onPointerDown={() => {
				dragging.current = true;
			}}
			onKeyDown={(event) => {
				const step = event.key === 'ArrowLeft' ? -4 : event.key === 'ArrowRight' ? 4 : 0;
				if (step === 0) return;
				event.preventDefault();
				const next = percent + (from === 'left' ? step : -step);
				onMove(Math.min(max, Math.max(min, next)));
			}}
			className="hidden w-1.5 shrink-0 cursor-col-resize bg-slate-200 transition-colors hover:bg-brand focus-visible:bg-brand focus-visible:outline-none motion-reduce:transition-none lg:block dark:bg-slate-700"
		/>
	);
}
