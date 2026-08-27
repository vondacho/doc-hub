/**
 * The sticky left rail: one label per band, then below the line.
 *
 * Each label says whether it is a sprint or a release and shows the band's id in
 * the tracker. The kind is not decoration: it is what makes "four sprints
 * leading to a release" readable as a plan rather than as five equal rows. Both
 * are doc-em's, ported so a band means the same thing on both boards.
 *
 * Two details are load-bearing rather than cosmetic.
 *
 * The rail is opaque. A `sticky` element with a transparent background lets the
 * cards scroll visibly through it, which looks like a rendering bug and makes
 * the labels unreadable exactly when they matter.
 *
 * It sits at z-4, which is a narrow gap on purpose: above the story cards, so
 * they scroll *under* it sideways, and below the header band at z-5, so the
 * band labels scroll *under the backbone* vertically. It used to be z-20 — above
 * the header — and a band sliding up appeared over the strip above the
 * "Releases" title, which is the one place nothing should ever be drawn.
 *
 * Below-the-line is rendered *outside* the SortableContext. It is not a band:
 * it cannot be renamed, cannot be deleted, and is always last, so it must not be
 * pickable — dragging it above a release would be asking the board to represent
 * something the file format cannot say.
 */

import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useId, useRef, useState } from 'react';
import type { BoardAction } from '../../lib/board/gestures.ts';
import { deliveryKindLabel, type DeliveryKind } from '../../lib/storymap/model.ts';
import type { BoardState, Id } from '../../lib/board/state.ts';
import { IconButton } from './IconButton.tsx';

export function BandRail({
	board,
	dispatch,
	firstRow,
	selected,
	onSelect,
}: {
	board: BoardState;
	dispatch: (action: BoardAction) => void;
	firstRow: number;
	/** The band whose declaration the source pane is emphasising, if any. */
	selected: Id | null;
	onSelect: (id: Id) => void;
}) {
	return (
		<>
			<SortableContext items={[...board.deliveryOrder]} strategy={verticalListSortingStrategy}>
				{board.deliveryOrder.map((deliveryId, index) => (
					<BandLabel
						key={deliveryId}
						board={board}
						dispatch={dispatch}
						deliveryId={deliveryId}
						selected={selected === deliveryId}
						onSelect={() => onSelect(deliveryId)}
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
					Known, not committed to.
				</p>
			</div>
		</>
	);
}

function BandLabel({
	board,
	dispatch,
	deliveryId,
	selected,
	onSelect,
	index,
	row,
}: {
	board: BoardState;
	dispatch: (action: BoardAction) => void;
	deliveryId: Id;
	/** Whether the source pane is emphasising this band's declaration. */
	selected: boolean;
	onSelect: () => void;
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
		dispatch({ type: 'retitle', kind: 'delivery', id: deliveryId, title: value });
	};

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
			onClick={onSelect}
			className={`group sticky left-0 z-[4] rounded-[0.4em] bg-white px-[0.5em] py-[0.4em] dark:bg-night-raised ${
				selected ? 'ring-2 ring-brand ring-inset dark:ring-sky-400' : ''
			}`}
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
					}${delivery.ticket === null ? '' : `, ticket ${delivery.ticket}`}`}
					className="block w-full cursor-grab text-left text-[0.95em] font-semibold break-words focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:cursor-grabbing"
				>
					{delivery.title}
				</button>
			)}

			<TicketField
				ticket={delivery.ticket}
				title={delivery.title}
				onChange={(ticket) => dispatch({ type: 'setDeliveryTicket', id: deliveryId, ticket })}
			/>

			<div className="mt-[0.15em]">
				<KindToggle
					kind={delivery.kind}
					title={delivery.title}
					onChange={(kind) => dispatch({ type: 'setDeliveryKind', id: deliveryId, kind })}
				/>
			</div>

			<div className="mt-1 flex gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none">
				<IconButton
					icon="up"
					label={`Move ${delivery.title} earlier`}
					size="sm"
					disabled={index === 0}
					onClick={() => dispatch({ type: 'moveDelivery', deliveryId, index: index - 1 })}
				/>
				<IconButton
					icon="down"
					label={`Move ${delivery.title} later`}
					size="sm"
					disabled={index === board.deliveryOrder.length - 1}
					onClick={() => dispatch({ type: 'moveDelivery', deliveryId, index: index + 1 })}
				/>
				{/* Deleting a band never deletes work — its stories drop below the
				    line. The label says so, because that is where somebody
				    hesitates, and it is the tooltip as well as the accessible name. */}
				<IconButton
					icon="trash"
					label={`Delete ${delivery.title} — its stories move below the line`}
					size="sm"
					tone="danger"
					onClick={() => dispatch({ type: 'removeDelivery', id: deliveryId })}
				/>
			</div>
		</div>
	);
}

/**
 * The band's id in the tracker, shown and editable.
 *
 * Editable here, where doc-em's is not. The difference is real rather than an
 * inconsistency between the two boards: doc-sm *issues* tickets through its
 * publish flow, so a board that could not record what the tracker sent back
 * would be refusing to store its own output. doc-em only ever reads an id
 * somebody else created, so it has no business letting one be typed.
 *
 * Committed on blur, like every other field on this board, which keeps a change
 * to one undo step. Emptying it unlinks the band rather than storing "".
 */
function TicketField({
	ticket,
	title,
	onChange,
}: {
	ticket: string | null;
	title: string;
	onChange: (ticket: string | null) => void;
}) {
	const id = useId();
	const [draft, setDraft] = useState(ticket ?? '');

	// Follows an import, an undo, or a publish that filled it in from outside.
	const [seen, setSeen] = useState(ticket);
	if (seen !== ticket) {
		setSeen(ticket);
		setDraft(ticket ?? '');
	}

	return (
		<input
			id={id}
			value={draft}
			placeholder="no ticket"
			aria-label={`Ticket for ${title}`}
			onChange={(event) => setDraft(event.target.value)}
			onBlur={() => onChange(draft.trim() === '' ? null : draft.trim())}
			onKeyDown={(event) => {
				if (event.key === 'Enter') event.currentTarget.blur();
			}}
			className="mt-[0.1em] w-full rounded-sm border border-transparent bg-transparent px-[0.15em] font-mono text-[0.7em] text-ink-muted hover:border-slate-300 focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-brand dark:text-slate-400 dark:hover:border-slate-600"
		/>
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
