/**
 * One cell of the board: the stories for one step, in one release band.
 *
 * A cell is a `useDroppable` in its own right, *as well as* a SortableContext.
 * That is not belt and braces — it is the fix for the most common bug in
 * dnd-kit's multi-container pattern. An empty SortableContext has no items to
 * collide with, so without an explicit droppable you cannot drop into an empty
 * cell. On a story map most cells are empty, which would make the failure look
 * like the whole board rejecting drops rather than an edge case.
 *
 * Semantics are a list, not an ARIA grid. `role="grid"` promises cell-by-cell
 * arrow navigation and a roving tabindex, and this board implements neither — a
 * broken promise to a screen-reader user is worse than no promise at all.
 */

import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { CSSProperties, ReactNode } from 'react';
import type { CellKey } from '../../lib/board/state.ts';
import { Icon } from './Icon.tsx';

export function Cell({
	cell,
	label,
	storyIds,
	onAdd,
	children,
	style,
}: {
	cell: CellKey;
	/** "Search the catalog, MVP" — read out on the list and on the add button. */
	label: string;
	storyIds: readonly string[];
	onAdd: () => void;
	children: ReactNode;
	style: CSSProperties;
}) {
	const { setNodeRef, isOver } = useDroppable({ id: cell, data: { accepts: 'story', cell } });

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={`group/cell min-h-20 rounded-lg border border-dashed p-1.5 transition-colors motion-reduce:transition-none ${
				isOver
					? 'border-brand bg-brand/5 dark:border-sky-400 dark:bg-sky-400/10'
					: 'border-slate-200 dark:border-slate-700'
			}`}
		>
			<ul aria-label={label} className="flex flex-col gap-1.5">
				<SortableContext items={[...storyIds]} strategy={verticalListSortingStrategy}>
					{children}
				</SortableContext>
			</ul>

			{/* Kept wordless but not label-less: what it adds is unambiguous from
			    where it sits, and the accessible name names the cell it adds to. */}
			<button
				type="button"
				onClick={onAdd}
				aria-label={`Add a story to ${label}`}
				className="mt-1.5 flex w-full items-center justify-center rounded-md border border-transparent px-2 py-1 text-ink-muted opacity-0 transition hover:border-slate-300 hover:text-brand focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand group-hover/cell:opacity-100 motion-reduce:transition-none dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-sky-400"
			>
				<Icon name="plus" className="h-4 w-4" />
			</button>
		</div>
	);
}
