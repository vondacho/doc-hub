/**
 * The sticky left rail: one label per delivery, then below the line.
 *
 * doc-sm's band rail, with one addition that is the point of this board — each
 * label says whether it is a sprint or a release, and lets you change it. The
 * kind is not decoration: it is what makes "four sprints leading to a release"
 * readable as a plan rather than as five equal rows.
 *
 * Three details are load-bearing rather than cosmetic, and all three were bought
 * with real bugs in doc-sm.
 *
 * The rail is **opaque**. A `sticky` element with a transparent background lets
 * the cards scroll visibly through it, which looks like a rendering fault and
 * makes the labels unreadable exactly when they matter.
 *
 * It sits at **z-4**, which is a narrow gap on purpose: above the example cards,
 * so they scroll *under* it sideways, and below the header band at z-5, so the
 * labels scroll *under the rules* vertically.
 *
 * Below-the-line is rendered **outside** the SortableContext. It is not a
 * delivery: it cannot be renamed, cannot be deleted, and is always last, so it
 * must not be pickable — dragging it above a sprint would be asking the board to
 * represent something the file format cannot say.
 */

import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useId, useRef, useState } from 'react';
import { deliveryKindLabel, type DeliveryKind } from '../../lib/examplemap/model.ts';
import type { BoardAction } from '../../lib/board/reducer.ts';
import type { BoardState, Id } from '../../lib/board/state.ts';
import { IconButton } from './IconButton.tsx';

export function DeliveryRail({
	board,
	dispatch,
	firstRow,
}: {
	board: BoardState;
	dispatch: (action: BoardAction) => void;
	/** Grid row of the first band. The rail owns column 1 from here down. */
	firstRow: number;
}) {
	return (
		<>
			<SortableContext items={[...board.deliveryOrder]} strategy={verticalListSortingStrategy}>
				{board.deliveryOrder.map((deliveryId, index) => (
					<DeliveryLabel
						key={deliveryId}
						board={board}
						dispatch={dispatch}
						deliveryId={deliveryId}
						index={index}
						row={firstRow + index}
					/>
				))}
			</SortableContext>

			<div
				style={{ gridColumn: 1, gridRow: firstRow + board.deliveryOrder.length }}
				className="sticky left-0 z-[4] rounded-[0.4em] bg-white px-[0.5em] py-[0.4em] dark:bg-night-raised"
			>
				<p className="text-[0.95em] font-semibold">Below the line</p>
				<p className="mt-[0.15em] text-[0.75em] text-ink-muted dark:text-slate-400">
					Agreed, not scheduled.
				</p>
			</div>
		</>
	);
}

function DeliveryLabel({
	board,
	dispatch,
	deliveryId,
	index,
	row,
}: {
	board: BoardState;
	dispatch: (action: BoardAction) => void;
	deliveryId: Id;
	index: number;
	row: number;
}) {
	const delivery = board.deliveries[deliveryId];
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: deliveryId,
		data: { type: 'delivery' },
	});
	const [editing, setEditing] = useState(false);
	const input = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (editing) {
			input.current?.focus();
			input.current?.select();
		}
	}, [editing]);

	if (!delivery) return null;

	const commit = (value: string) => {
		setEditing(false);
		dispatch({ type: 'retitleDelivery', id: deliveryId, title: value });
	};

	// The story ships here. Worth marking on the rail rather than only on the
	// story card, because this is the row a reader is scanning when they ask
	// "when is this done?" — and it is the line every example should land on or
	// before.
	const shipsHere = board.story?.release === deliveryId;

	return (
		<div
			ref={setNodeRef}
			style={{
				gridColumn: 1,
				gridRow: row,
				transform: CSS.Translate.toString(transform),
				transition,
				opacity: isDragging ? 0.35 : undefined,
			}}
			className="group sticky left-0 z-[4] rounded-[0.4em] bg-white px-[0.5em] py-[0.4em] dark:bg-night-raised"
		>
			{editing ? (
				<input
					ref={input}
					defaultValue={delivery.title}
					aria-label="Rename this delivery"
					onBlur={(event) => commit(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === 'Enter') commit(event.currentTarget.value);
						if (event.key === 'Escape') setEditing(false);
					}}
					className="w-full rounded-sm border border-slate-300 px-1 py-0.5 text-sm focus-visible:outline-2 focus-visible:outline-brand dark:border-slate-600 dark:bg-black/30"
				/>
			) : (
				<button
					type="button"
					{...attributes}
					{...listeners}
					onClick={() => setEditing(true)}
					aria-label={`${deliveryKindLabel[delivery.kind]} ${delivery.title}, band ${index + 1} of ${
						board.deliveryOrder.length
					}${delivery.ticket === null ? '' : `, ticket ${delivery.ticket}`}${
						shipsHere ? '. The story ships here.' : ''
					}`}
					className="block w-full cursor-grab text-left text-[0.95em] font-semibold break-words focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:cursor-grabbing"
				>
					{delivery.title}
				</button>
			)}

			{/*
			 * The tracker's id for this band, shown and not editable — the same rule
			 * the story's follows, and for the same reason: a mistyped id here
			 * silently re-points a whole sprint's worth of examples, with no symptom
			 * on the board. It is set by editing the `.examplemap` file, where the
			 * change is deliberate and reviewable.
			 *
			 * Hidden when there is none. A band that no tracker knows about is the
			 * ordinary state of a plan, and an empty slot on every row would be noise
			 * pretending to be information.
			 *
			 * Not focusable, so the title above it stays the one tab stop on a row
			 * that already has four controls.
			 */}
			{delivery.ticket !== null && (
				<p aria-hidden="true" className="mt-[0.1em] font-mono text-[0.7em] text-ink-muted dark:text-slate-400">
					{delivery.ticket}
				</p>
			)}

			<div className="mt-[0.15em] flex flex-wrap items-center gap-[0.3em]">
				<KindToggle
					kind={delivery.kind}
					title={delivery.title}
					onChange={(kind) => dispatch({ type: 'setDeliveryKind', id: deliveryId, kind })}
				/>
				{/* Sprints only. A release is delivered by the sprints before it, so
				    sizing it would state a second number for the same work — and the
				    file cannot say it either. Absent rather than disabled: a control
				    that is never usable on this kind of row is not a control. */}
				{delivery.kind === 'sprint' && (
					<PointsField
						points={delivery.points}
						title={delivery.title}
						onChange={(points) => dispatch({ type: 'setDeliveryPoints', id: deliveryId, points })}
					/>
				)}
			</div>

			<div className="mt-1 flex gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none">
				<IconButton
					icon="up"
					label={`Move ${delivery.title} earlier`}
					size="sm"
					disabled={index === 0}
					onClick={() => dispatch({ type: 'moveDelivery', id: deliveryId, index: index - 1 })}
				/>
				<IconButton
					icon="down"
					label={`Move ${delivery.title} later`}
					size="sm"
					disabled={index === board.deliveryOrder.length - 1}
					onClick={() => dispatch({ type: 'moveDelivery', id: deliveryId, index: index + 1 })}
				/>
				{/* Deleting a band never deletes work — its examples drop below the
				    line. The label says so, because that is where somebody
				    hesitates, and it is the tooltip as well as the accessible name. */}
				<IconButton
					icon="trash"
					label={`Delete ${delivery.title} — its examples move below the line`}
					size="sm"
					tone="danger"
					onClick={() => dispatch({ type: 'removeDelivery', id: deliveryId })}
				/>
			</div>
		</div>
	);
}

/**
 * How big this sprint is, in story points.
 *
 * A plain number box, committed on blur like every other field on this board,
 * which keeps a change to one undo step. Empty means unsized, and unsized is not
 * zero: a sprint carrying no estimable work is a different statement from one
 * nobody has looked at, and the file distinguishes them too.
 *
 * `inputMode="numeric"` rather than `type="number"`: the spinner arrows are
 * useless on a Fibonacci scale — nobody wants to step from 8 to 9 — and they
 * steal horizontal space from a rail that has little to spare. Non-digits are
 * dropped as they are typed, so there is no invalid state to report and no error
 * message to write.
 *
 * The unit lives in the label rather than in the box, so the number stays the
 * only thing that has to be read.
 */
function PointsField({
	points,
	title,
	onChange,
}: {
	points: number | null;
	title: string;
	onChange: (points: number | null) => void;
}) {
	const id = useId();
	const [draft, setDraft] = useState(points === null ? '' : String(points));

	// Follows an import, an undo, or the kind being switched away and back.
	const [seen, setSeen] = useState(points);
	if (seen !== points) {
		setSeen(points);
		setDraft(points === null ? '' : String(points));
	}

	const commit = (value: string) => {
		const trimmed = value.trim();
		onChange(trimmed === '' ? null : Number(trimmed));
	};

	return (
		<span className="flex items-center gap-[0.2em]">
			<input
				id={id}
				value={draft}
				inputMode="numeric"
				placeholder="—"
				aria-label={`Story points for ${title}`}
				onChange={(event) => setDraft(event.target.value.replace(/\D/g, ''))}
				onBlur={(event) => commit(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === 'Enter') event.currentTarget.blur();
				}}
				className="w-[2.6em] rounded-sm border border-slate-300 bg-transparent px-[0.25em] py-px text-center text-[0.7em] tabular-nums focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-brand dark:border-slate-600"
			/>
			<label htmlFor={id} className="text-[0.66em] text-ink-muted dark:text-slate-400">
				pts
			</label>
		</span>
	);
}

/**
 * Sprint or release, as two small radio-ish buttons rather than a select.
 *
 * There are exactly two values and they are both one word, so a dropdown would
 * hide half the answer behind a click to save no space at all. Rendered as a
 * radiogroup so it is one tab stop and arrow-navigable, which is what a
 * two-value choice should be.
 */
function KindToggle({
	kind,
	title,
	onChange,
}: {
	kind: DeliveryKind;
	title: string;
	onChange: (kind: DeliveryKind) => void;
}) {
	return (
		<div role="radiogroup" aria-label={`What kind of delivery ${title} is`} className="flex gap-[0.15em]">
			{(['sprint', 'release'] as const).map((candidate) => (
				<button
					key={candidate}
					type="button"
					role="radio"
					aria-checked={kind === candidate}
					onClick={() => onChange(candidate)}
					className={`rounded-full border px-[0.4em] py-px text-[0.66em] font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand ${
						kind === candidate
							? 'border-ink bg-ink text-white dark:border-slate-200 dark:bg-slate-200 dark:text-ink'
							: 'border-slate-300 text-ink-muted hover:border-brand hover:text-brand dark:border-slate-600 dark:text-slate-400'
					}`}
				>
					{deliveryKindLabel[candidate]}
				</button>
			))}
		</div>
	);
}
