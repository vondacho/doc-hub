/**
 * The sticky left rail: one label per release band, then below the line.
 *
 * Two details are load-bearing rather than cosmetic.
 *
 * The rail is opaque. A `sticky` element with a transparent background lets the
 * cards scroll visibly through it, which looks like a rendering bug and makes
 * the labels unreadable exactly when they matter.
 *
 * Below-the-line is rendered *outside* the SortableContext. It is not a release:
 * it cannot be renamed, cannot be deleted, and is always last, so it must not be
 * pickable — dragging it above a release would be asking the board to represent
 * something the file format cannot say.
 */

import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEffect, useRef, useState } from 'react';
import type { BoardAction } from '../../lib/board/reducer.ts';
import type { BoardState, Id } from '../../lib/board/state.ts';

export function BandRail({
	board,
	dispatch,
	firstRow,
}: {
	board: BoardState;
	dispatch: (action: BoardAction) => void;
	firstRow: number;
}) {
	return (
		<>
			<SortableContext items={[...board.releaseOrder]} strategy={verticalListSortingStrategy}>
				{board.releaseOrder.map((releaseId, index) => (
					<BandLabel
						key={releaseId}
						board={board}
						dispatch={dispatch}
						releaseId={releaseId}
						index={index}
						row={firstRow + index}
					/>
				))}
			</SortableContext>

			<div
				style={{ gridColumn: 1, gridRow: firstRow + board.releaseOrder.length }}
				className="sticky left-0 z-20 rounded-lg bg-white px-2 py-2 dark:bg-night-raised"
			>
				<p className="text-sm font-semibold">Below the line</p>
				<p className="mt-0.5 text-xs text-ink-muted dark:text-slate-400">
					Known, not committed to.
				</p>
			</div>
		</>
	);
}

function BandLabel({
	board,
	dispatch,
	releaseId,
	index,
	row,
}: {
	board: BoardState;
	dispatch: (action: BoardAction) => void;
	releaseId: Id;
	index: number;
	row: number;
}) {
	const release = board.releases[releaseId];
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id: releaseId,
		data: { type: 'release' },
	});
	const [editing, setEditing] = useState(false);
	const input = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (editing) {
			input.current?.focus();
			input.current?.select();
		}
	}, [editing]);

	if (!release) return null;

	const commit = (value: string) => {
		setEditing(false);
		dispatch({ type: 'retitle', kind: 'release', id: releaseId, title: value });
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
			className="group sticky left-0 z-20 rounded-lg bg-white px-2 py-2 dark:bg-night-raised"
		>
			{editing ? (
				<input
					ref={input}
					defaultValue={release.title}
					aria-label="Rename this release"
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
					aria-label={`Release ${release.title}, band ${index + 1} of ${board.releaseOrder.length}`}
					className="block w-full cursor-grab text-left text-sm font-semibold break-words focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:cursor-grabbing"
				>
					{release.title}
				</button>
			)}

			<div className="mt-1 flex gap-2 text-xs opacity-0 transition group-hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none">
				<button
					type="button"
					disabled={index === 0}
					onClick={() => dispatch({ type: 'moveRelease', releaseId, index: index - 1 })}
					className="text-ink-muted hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand disabled:opacity-40 dark:text-slate-400 dark:hover:text-sky-400"
				>
					Up
				</button>
				<button
					type="button"
					disabled={index === board.releaseOrder.length - 1}
					onClick={() => dispatch({ type: 'moveRelease', releaseId, index: index + 1 })}
					className="text-ink-muted hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand disabled:opacity-40 dark:text-slate-400 dark:hover:text-sky-400"
				>
					Down
				</button>
				{/* Deleting a band never deletes work — its stories drop below the
				    line. Said here, on the control, because that is where somebody
				    hesitates. */}
				<button
					type="button"
					onClick={() => dispatch({ type: 'removeRelease', id: releaseId })}
					title="Its stories move below the line"
					className="text-ink-muted hover:text-critical focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand dark:text-slate-400"
				>
					Delete
				</button>
			</div>
		</div>
	);
}
