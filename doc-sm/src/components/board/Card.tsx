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

import {
	useEffect,
	useRef,
	useState,
	type CSSProperties,
	type KeyboardEvent,
	type ReactNode,
} from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cardClass, kindLabel } from '../../lib/board/kinds.ts';
import type { CardKind, Id } from '../../lib/board/state.ts';
import { CardMenu, type CardMenuAction } from './CardMenu.tsx';
import { Icon } from './Icon.tsx';

export interface CardProps {
	readonly id: Id;
	readonly kind: CardKind;
	readonly title: string;
	readonly notes: readonly string[];
	/** Extra text after the kind in the accessible name — "in MVP, 2 of 5". */
	readonly position?: string;
	readonly menu: readonly CardMenuAction[];
	/** Whether this card's detail is open. Hidden is the default, everywhere. */
	readonly detailOpen: boolean;
	readonly onToggleDetail: () => void;
	/** What the detail is called on this kind of card — "cast", "need", "notes". */
	readonly detailLabel: string;
	/** Story-only: the ticket and status line, rendered under the title. */
	readonly meta?: ReactNode;
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
	meta,
	detailOpen,
	onToggleDetail,
	detailLabel,
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
			// Sized in `em`, not `rem`. The scroll container in BoardGrid sets one
			// font-size from the zoom level and everything here follows from it —
			// which is what makes zoom a real layout change rather than a
			// transform, and transforms are what break sticky headers and dnd-kit's
			// hit-testing.
			className={`group relative rounded-[0.4em] border px-[0.55em] py-[0.4em] text-[1em] shadow-sm motion-reduce:transition-none ${cardClass[kind]} ${className}`}
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
				/*
				 * Title, caret and menu on one row.
				 *
				 * The caret sits immediately right of the title because that is
				 * where a disclosure belongs — beside the thing it discloses, not
				 * below it, where it reads as the first line of the content it is
				 * meant to be hiding.
				 *
				 * The menu is in this row rather than absolutely positioned in the
				 * corner, which is where it used to be: two controls cannot share
				 * one corner. Keeping it in the flow also means it reserves its
				 * space, so revealing it on hover no longer nudges the title.
				 */
				<div className="flex items-start gap-[0.15em]">
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
						// min-w-0 so a long word wraps instead of forcing the row
						// wider than the column.
						className="min-w-0 flex-1 cursor-grab text-left leading-snug break-words hyphens-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand active:cursor-grabbing"
					>
						{title}
					</button>

					{notes.length > 0 && (
						<button
							type="button"
							onClick={onToggleDetail}
							aria-expanded={detailOpen}
							aria-label={`${detailOpen ? 'Hide' : 'Show'} the ${detailLabel} of ${title}`}
							className="shrink-0 rounded-sm text-ink-muted transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand motion-reduce:transition-none dark:text-slate-400 dark:hover:text-sky-400"
						>
							<Icon name={detailOpen ? 'up' : 'down'} className="h-[1.05em] w-[1.05em]" />
						</button>
					)}

					<CardMenu label={label} actions={menu} />
				</div>
			)}

			{/*
			    Detail is collapsed by default, so a board opens at the size of its
			    titles. The toggle is **always visible** when there is anything to
			    show, and never hover-only: it is the only sign that a card is
			    hiding something, and a card whose contents can only be discovered
			    by chance is a card whose contents are lost.

			    When open: notes wrap and are never clamped. The column is narrow on
			    purpose — a story map is read across, and wide cards cost columns on
			    screen — so the width is constrained and the height is not.
			    `whitespace-pre-line` shows the breaks the text actually carries;
			    separate notes join with a break rather than a space, so two notes
			    read as two lines rather than one run-on. Anything narrower than 50
			    columns — which the card usually is — wraps again on top, which is
			    why `break-words` stays.
			*/}
			{notes.length > 0 && !editing && detailOpen && (
				<p className="mt-[0.25em] text-[0.8em] leading-snug break-words hyphens-auto whitespace-pre-line text-ink-muted dark:text-slate-400">
					{notes.join('\n')}
				</p>
			)}

			{meta}

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
			className="w-full resize-none rounded-sm bg-white/70 px-[0.2em] py-[0.1em] text-[1em] text-ink focus-visible:outline-2 focus-visible:outline-brand dark:bg-black/30 dark:text-slate-100"
		/>
	);
}
