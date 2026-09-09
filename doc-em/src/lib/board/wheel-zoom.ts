/**
 * Zooming the board with ctrl and the wheel.
 *
 * The toolbar's two buttons were the only way to change the zoom, and they are
 * a long way from the board: somebody reading a wall at the bottom of a tall
 * scroller has to travel to the top of the frame and back for every step. Ctrl
 * with the wheel is the gesture every map, canvas and drawing tool already uses
 * for this, and it costs the hand nothing — the pointer is already over the
 * thing being resized.
 *
 * It also arrives free on a Mac trackpad. A pinch is delivered as a wheel event
 * with `ctrlKey` set, whether or not a finger is anywhere near the key, so
 * pinch-to-zoom on the board works without a line of code that knows about it.
 *
 * ## Three things this has to get right
 *
 * **The listener must be native and non-passive.** React registers `onWheel` as
 * a *passive* listener on the root — it has since React 17 — so
 * `preventDefault` inside a React wheel handler does nothing but log a warning,
 * and ctrl with the wheel is the browser's own page zoom. Without the default
 * suppressed, one gesture zooms the board *and* the whole browser window. Hence
 * `addEventListener` with `{ passive: false }` on the element itself.
 *
 * **A wheel is not a step.** The board zooms in five discrete stops, and one
 * flick of a trackpad is a burst of a dozen small deltas: fed straight through,
 * a single gesture crosses the whole range and there is no way to ask for one
 * stop. So the deltas accumulate and a stop is taken when they pass a
 * threshold, with the remainder dropped rather than carried — carrying it makes
 * a slow scroll eventually jump, which reads as the board deciding on its own.
 * A reversal clears the accumulator, so changing your mind is immediate rather
 * than having to pay back the distance already travelled.
 *
 * `deltaMode` is normalised first. A wheel reports pixels on most machines,
 * *lines* on some Windows and Linux mice, and pages when a wheel is configured
 * to page — three units through one threshold, unnormalised, means the gesture
 * has a different sensitivity depending on whose desk it is on.
 *
 * **The point under the pointer has to stay there.** The board is a scroller,
 * not a viewport with a transform, and its content is sized in `em` off one
 * font size — so a step multiplies every distance in it, the scroll offset
 * included. Left alone, zooming with the pointer over a card two screens to the
 * right sends that card off the edge, and the zoom feels like it happened to
 * somebody else's board. The fix is one line of arithmetic applied after the
 * new size is on screen: the content point under the pointer is
 * `scroll + pointer`, it moves to `ratio × (scroll + pointer)`, and the scroll
 * that puts it back under the pointer is that minus `pointer`.
 */

import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * How much wheel makes one stop.
 *
 * In pixels, after normalisation. A notch of a mouse wheel is 100 in Chrome and
 * 53 in Firefox, so anything at or under 53 gives a notch a stop each, which is
 * what a notch is for. A trackpad swipe of a couple of centimetres is a few
 * hundred, so it crosses two or three stops — a swipe is a bigger gesture than
 * a notch and should do more.
 */
const STEP_DELTA = 50;

/** Rough pixel heights for the two non-pixel delta modes. */
const LINE_HEIGHT = 16;
const PAGE_HEIGHT = 400;

export function useWheelZoom({
	target,
	zoom,
	onStep,
}: {
	/** The scrolling element the board is drawn in. */
	target: React.RefObject<HTMLElement | null>;
	/** The zoom currently applied, so a step can be measured against it. */
	zoom: number;
	/** One stop in, or one stop out. Clamping at the ends belongs to the caller. */
	onStep: (direction: 1 | -1) => void;
}): void {
	/*
	 * Where the pointer was when the step was asked for, in the scroller's own
	 * client coordinates, and null when the zoom changed for any other reason.
	 *
	 * The toolbar's buttons have no pointer to anchor on and deliberately do not
	 * get one: they leave the scroll where it is, which is what they have always
	 * done and what somebody pressing a button at the top of the frame expects.
	 */
	const anchor = useRef<{ x: number; y: number } | null>(null);
	const travelled = useRef(0);

	// Read through a ref so the listener is installed once rather than on every
	// zoom step — re-registering a non-passive listener mid-gesture is how a
	// gesture loses its second half.
	const latest = useRef(onStep);
	latest.current = onStep;

	useEffect(() => {
		const element = target.current;
		if (!element) return;

		const onWheel = (event: WheelEvent) => {
			if (!event.ctrlKey) return;
			// Ours now — otherwise this is the browser's page zoom, and the two
			// would fire together. See the note at the top for why this cannot be
			// a React `onWheel`.
			event.preventDefault();

			const delta = event.deltaY * scaleOf(event.deltaMode);
			// A reversal is a new gesture, not a continuation of the last one.
			if (delta * travelled.current < 0) travelled.current = 0;
			travelled.current += delta;
			if (Math.abs(travelled.current) < STEP_DELTA) return;
			travelled.current = 0;

			const box = element.getBoundingClientRect();
			anchor.current = { x: event.clientX - box.left, y: event.clientY - box.top };
			// Down is away, as it is everywhere else: the natural direction of a
			// wheel pushed away from the hand is "smaller".
			latest.current(delta < 0 ? 1 : -1);
		};

		element.addEventListener('wheel', onWheel, { passive: false });
		return () => element.removeEventListener('wheel', onWheel);
	}, [target]);

	/*
	 * Put the anchored point back under the pointer, once the new size is laid
	 * out and before the browser paints — with `useEffect` the board is drawn at
	 * the new size with the old scroll first, and the visible jump is exactly
	 * what this exists to remove.
	 */
	const previous = useRef(zoom);
	useLayoutEffect(() => {
		const ratio = zoom / previous.current;
		previous.current = zoom;

		const point = anchor.current;
		anchor.current = null;
		const element = target.current;
		if (!element || point === null || ratio === 1) return;

		element.scrollLeft = ratio * (element.scrollLeft + point.x) - point.x;
		element.scrollTop = ratio * (element.scrollTop + point.y) - point.y;
	}, [zoom, target]);
}

function scaleOf(deltaMode: number): number {
	if (deltaMode === WheelEvent.DOM_DELTA_LINE) return LINE_HEIGHT;
	if (deltaMode === WheelEvent.DOM_DELTA_PAGE) return PAGE_HEIGHT;
	return 1;
}
