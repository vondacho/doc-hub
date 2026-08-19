/**
 * One card, of any kind.
 *
 * Three responsibilities, and the third is the one that matters: it is a drag
 * source, it edits its own title in place, and it carries a menu offering every
 * move that drag offers. The menu is not a fallback bolted on afterwards — it
 * was built before the drag code was, so that the keyboard path is the real path
 * rather than a retrofit that nobody exercises.
 *
 * The inline editor holds its draft in local state and dispatches exactly once,
 * on blur or Enter. That is what keeps a rename to one undo step, and it is why
 * src/lib/board/history.ts needs no action-coalescing machinery at all.
 */

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cardClass, kindLabel } from '../../lib/board/kinds.ts';
import type { CardKind, Id } from '../../lib/board/state.ts';
import { CardMenu, type CardMenuAction } from './CardMenu.tsx';

export interface CardProps {
	readonly id: Id;
	readonly kind: CardKind;
	readonly title: string;
	readonly notes: readonly string[];
	/** Extra text after the kind in the accessible name — "in MVP, 2 of 5". */
	readonly position?: string;
	readonly menu: readonly CardMenuAction[];
	readonly onRetitle: (title: string) => void;
	readonly style?: CSSProperties;
	readonly className?: string;
	/** Sortable data, so the drag handlers know what was picked up. */
	readonly data: Record<string, unknown>;
}

export function Card({
	id,
	kind,
	title,
	notes,
	position,
	menu,
	onRetitle,
	style,
	className = '',
	data,
}: CardProps) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, data });
	const [editing, setEditing] = useState(false);

	// The accessible name says the kind out loud. Colour is kind here, and colour
	// is never allowed to be the only signal.
	const label = `${kindLabel[kind]}: ${title}${position ? `, ${position}` : ''}`;

	return (
		<div
			ref={setNodeRef}
			style={{
				...style,
				transform: CSS.Translate.toString(transform),
				transition,
				// The card stays in the flow while dragging; the DragOverlay draws
				// the moving copy. Hiding it outright would collapse the cell and
				// make every other card jump.
				opacity: isDragging ? 0.35 : undefined,
			}}
			className={`group relative rounded-lg border px-2.5 py-2 text-sm shadow-sm motion-reduce:transition-none ${cardClass[kind]} ${className}`}
		>
			{editing ? (
				<TitleEditor
					value={title}
					label={`Rename this ${kindLabel[kind].toLowerCase()}`}
					onCommit={(next) => {
						setEditing(false);
						onRetitle(next);
					}}
					onCancel={() => setEditing(false)}
				/>
			) : (
				<button
					type="button"
					// The drag listeners live on the same element that opens the
					// editor. PointerSensor's 6px activation constraint is what
					// keeps the two apart — without it every click starts a drag
					// and the title never opens.
					{...attributes}
					{...listeners}
					onClick={() => setEditing(true)}
					aria-label={label}
					className="block w-full cursor-grab text-left break-words focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:cursor-grabbing"
				>
					{title}
				</button>
			)}

			{notes.length > 0 && !editing && (
				<p className="mt-1 text-xs text-ink-muted dark:text-slate-400">{notes.join(' ')}</p>
			)}

			{!editing && <CardMenu label={label} actions={menu} />}
		</div>
	);
}

function TitleEditor({
	value,
	label,
	onCommit,
	onCancel,
}: {
	value: string;
	label: string;
	onCommit: (next: string) => void;
	onCancel: () => void;
}) {
	const [draft, setDraft] = useState(value);
	const ref = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		ref.current?.focus();
		ref.current?.select();
	}, []);

	const keys = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		// Enter commits; Shift+Enter would be a newline, which a card title has
		// no use for, so it commits too.
		if (event.key === 'Enter') {
			event.preventDefault();
			onCommit(draft);
			return;
		}
		// Escape reverts and dispatches nothing, so an abandoned edit never
		// reaches the undo stack.
		if (event.key === 'Escape') {
			event.preventDefault();
			onCancel();
		}
	};

	return (
		<textarea
			ref={ref}
			rows={2}
			value={draft}
			aria-label={label}
			onChange={(event) => setDraft(event.target.value)}
			onKeyDown={keys}
			onBlur={() => onCommit(draft)}
			className="w-full resize-none rounded-sm bg-white/70 px-1 py-0.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-brand dark:bg-black/30 dark:text-slate-100"
		/>
	);
}
