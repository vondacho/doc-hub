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
import { joinNotes } from '../../lib/storymap/model.ts';
import type { CardKind, Id } from '../../lib/board/state.ts';
import { CardMenu, type CardMenuAction } from './CardMenu.tsx';
import { Icon } from './Icon.tsx';
import { Tags } from './Tags.tsx';

export interface CardProps {
	readonly id: Id;
	readonly kind: CardKind;
	readonly title: string;
	/** Composed from modelled fields — an activity's cast. Shown, never edited. */
	readonly derived: readonly string[];
	/**
	 * Rendered at the top of the open detail, above the notes.
	 *
	 * Where a card's structured content goes when it is more than lines of text:
	 * a story's need is three separately editable clauses, so it arrives as a
	 * component rather than as strings.
	 */
	readonly detailContent?: ReactNode;
	/** Free prose. This is the part somebody can type into. */
	readonly notes: readonly string[];
	readonly onNotes: (text: string) => void;
	/**
	 * The card's free labels, drawn as chips under everything else.
	 *
	 * Every kind has them, so this is a required prop rather than an optional
	 * one: a card that forgot to pass its tags would show none and look exactly
	 * like a card that has none. An empty list draws nothing at all.
	 */
	readonly tags: readonly string[];
	readonly onTags: (tags: readonly string[]) => void;
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
	/** Whether this is the card whose text the source pane is emphasising. */
	readonly selected?: boolean;
	/**
	 * Called when the card is clicked anywhere.
	 *
	 * On the root rather than on the title, because the title's button already
	 * owns click — it opens the rename editor — and owns the drag listeners with
	 * it. Selection rides the bubble instead, so no gesture had to be taken away
	 * from anything: clicking the title still renames *and* selects, and clicking
	 * the card's own padding only selects.
	 *
	 * A completed drag does not select. dnd-kit's 6px activation constraint means
	 * a real drag never emits the click, which is the same mechanism that keeps
	 * dragging from opening the rename editor.
	 */
	readonly onSelect?: () => void;
}

export function Card({
	id,
	kind,
	title,
	derived,
	detailContent,
	notes,
	onNotes,
	position,
	menu,
	meta,
	tags,
	onTags,
	detailOpen,
	onToggleDetail,
	detailLabel,
	onRetitle,
	style,
	className = '',
	data,
	selected = false,
	onSelect,
}: CardProps) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, data });
	const [editing, setEditing] = useState(false);
	const [editingNotes, setEditingNotes] = useState(false);

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
			onClick={onSelect}
			// The ring is `inset` so it does not grow the card and shift the grid
			// when a selection moves between cards of different sizes.
			className={`group relative rounded-[0.4em] border px-[0.55em] py-[0.4em] text-[1em] shadow-sm transition-shadow motion-reduce:transition-none ${
				selected ? 'ring-2 ring-brand ring-inset dark:ring-sky-400' : ''
			} ${cardClass[kind]} ${className}`}
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

					{(derived.length > 0 || notes.length > 0 || detailContent !== undefined) && (
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
			{detailOpen && !editing && (
				<div className="mt-[0.25em] text-[0.8em] leading-snug text-ink-muted dark:text-slate-400">
					{detailContent}
					{derived.map((block, index) => (
						<p
							key={index}
							className="break-words hyphens-auto whitespace-pre-line"
						>
							{block}
						</p>
					))}

					{editingNotes ? (
						<NoteEditor
							value={joinNotes(notes)}
							label={`Notes on ${title}`}
							onCommit={(next) => {
								setEditingNotes(false);
								onNotes(next);
							}}
							onCancel={() => setEditingNotes(false)}
						/>
					) : (
						notes.length > 0 && (
							<button
								type="button"
								onClick={() => setEditingNotes(true)}
								aria-label={`Edit the notes on ${title}`}
								className={`block w-full text-left break-words hyphens-auto whitespace-pre-line focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand ${
									derived.length > 0 ? 'mt-[0.35em]' : ''
								}`}
							>
								{joinNotes(notes)}
							</button>
						)
					)}
				</div>
			)}

			{/*
			 * Below the notes and above the story's ticket line, which is the
			 * order of least-to-most fixed: the title is what the card says, the
			 * tags are what somebody added to it, and the filing underneath is
			 * what another system owns.
			 */}
			<Tags tags={tags} owner={title} onTags={onTags} />

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

/**
 * The notes editor.
 *
 * One difference from the title editor, and it is the reason this is a separate
 * component: **Enter inserts a line break**. A title is one line and Enter means
 * "done"; notes are prose, and a prose box where Return commits is a box you
 * cannot write a list in.
 *
 * So committing moves to blur and to Cmd/Ctrl+Enter, and Escape still abandons
 * without dispatching — the same contract the title editor has, minus the key
 * that now belongs to the text.
 *
 * A blank line separates one note from the next. splitNotes reads it back that
 * way, and the renderer joins by the same rule, so the block somebody types is
 * the block they see.
 */
function NoteEditor({
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
		// Caret at the end rather than a full selection: notes are usually being
		// added to, where a title is usually being replaced.
		const end = ref.current?.value.length ?? 0;
		ref.current?.setSelectionRange(end, end);
	}, []);

	return (
		<textarea
			ref={ref}
			rows={Math.min(12, Math.max(3, draft.split('\n').length + 1))}
			value={draft}
			aria-label={label}
			placeholder="A note. A blank line starts another."
			onChange={(event) => setDraft(event.target.value)}
			onKeyDown={(event) => {
				if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
					event.preventDefault();
					onCommit(draft);
					return;
				}
				if (event.key === 'Escape') {
					event.preventDefault();
					onCancel();
				}
				// Enter falls through: in prose it is a line break, not a verdict.
			}}
			onBlur={() => onCommit(draft)}
			className="mt-[0.25em] w-full resize-none rounded-sm bg-white/70 px-[0.2em] py-[0.1em] text-[1em] leading-snug text-ink focus-visible:outline-2 focus-visible:outline-brand dark:bg-black/30 dark:text-slate-100"
		/>
	);
}
