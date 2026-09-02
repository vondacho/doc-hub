/**
 * One card, of any of the four kinds.
 *
 * Adapted from doc-sm's, and deliberately the same object to use: a title you
 * click to edit, a caret beside it for anything hidden, a menu at the end of the
 * row. Somebody who has used the story mapper should not have to learn a second
 * set of gestures to use this one.
 *
 * Simpler than doc-sm's in one way — there is no ticket line — but not in
 * another: an example card carries its Given/When/Then, which arrives through
 * `detailContent` and shares the collapsible region with the notes. Everything
 * else here is a title and some notes, both text somebody typed.
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
import { cardClass } from '../../lib/board/kinds.ts';
import { cardLabel, joinNotes, type CardKind } from '../../lib/examplemap/model.ts';
import { CardMenu, type CardMenuAction } from './CardMenu.tsx';
import { Icon } from './Icon.tsx';
import { Tags } from './Tags.tsx';

export interface CardProps {
	readonly id: string;
	readonly kind: CardKind;
	readonly title: string;
	readonly notes: readonly string[];
	/**
	 * The card's free labels, drawn as chips under everything else.
	 *
	 * Every kind has them, so this is a required prop rather than an optional
	 * one: a card that forgot to pass its tags would show none and look exactly
	 * like a card that has none. An empty list draws nothing at all.
	 */
	readonly tags: readonly string[];
	readonly onTags: (tags: readonly string[]) => void;
	/** Extra text after the kind in the accessible name — "2 of 5 under …". */
	readonly position?: string;
	readonly menu: readonly CardMenuAction[];
	readonly detailOpen: boolean;
	readonly onToggleDetail: () => void;
	readonly onRetitle: (title: string) => void;
	readonly onNotes: (text: string) => void;
	/**
	 * Anything the card shows above its notes when expanded — the scenario, on an
	 * example. Its presence alone earns the card a caret, because a card can have
	 * something to reveal without having a note.
	 */
	readonly detailContent?: ReactNode;
	/** What the caret reveals, for its accessible name. Defaults to "the notes". */
	readonly detailName?: string;
	readonly style?: CSSProperties;
	readonly className?: string;
	/** Sortable data, so the drag handlers know what was picked up. */
	readonly data: Record<string, unknown>;
	/** Set for the story card, which is not draggable: there is only one of it. */
	readonly fixed?: boolean;
	/**
	 * Rendered at the foot of the card, below the notes.
	 *
	 * The story card's ticket and status line, and nothing else so far — see
	 * StoryMeta.tsx. Below rather than beside the title because it is the least
	 * of what the card says: the story is the sentence, the badges are its
	 * filing.
	 */
	readonly children?: ReactNode;
	/** Whether this is the card whose text the source pane is emphasising. */
	readonly selected?: boolean;
	/**
	 * Called when the card is clicked anywhere.
	 *
	 * On the root rather than on the title, because the title already owns click
	 * — it opens the rename — and owns the drag listeners with it. Selection
	 * rides the bubble, so no gesture had to be taken away from anything.
	 */
	readonly onSelect?: () => void;
}

export function Card({
	id,
	kind,
	title,
	notes,
	tags,
	onTags,
	position,
	menu,
	detailOpen,
	onToggleDetail,
	onRetitle,
	onNotes,
	detailContent,
	detailName = 'the notes',
	style,
	className = '',
	data,
	fixed = false,
	children,
	selected = false,
	onSelect,
}: CardProps) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
		id,
		data,
		disabled: fixed,
	});
	const [editing, setEditing] = useState(false);
	const [editingNotes, setEditingNotes] = useState(false);

	// The accessible name says the kind out loud. Colour is the notation here, and
	// colour is never allowed to be the only signal.
	const label = `${cardLabel[kind]}: ${title}${position ? `, ${position}` : ''}`;

	return (
		<div
			ref={setNodeRef}
			style={{
				...style,
				transform: CSS.Translate.toString(transform),
				transition,
				opacity: isDragging ? 0.35 : undefined,
			}}
			onClick={onSelect}
			// The ring is `inset` so selecting does not grow the card and shift the
			// grid around it.
			className={`group relative rounded-[0.4em] border px-[0.55em] py-[0.4em] text-[1em] shadow-sm transition-shadow motion-reduce:transition-none ${
				selected ? 'ring-2 ring-brand ring-inset dark:ring-sky-400' : ''
			} ${cardClass[kind]} ${className}`}
		>
			{editing ? (
				<TitleEditor
					value={title}
					label={`Rename this ${cardLabel[kind].toLowerCase()}`}
					onCommit={(next) => {
						setEditing(false);
						onRetitle(next);
					}}
					onCancel={() => setEditing(false)}
				/>
			) : (
				<div className="flex items-start gap-[0.15em]">
					<button
						type="button"
						// The drag listeners share the element that opens the editor.
						// PointerSensor's activation distance is what keeps the two
						// apart — without it every click starts a drag.
						{...attributes}
						{...listeners}
						onClick={() => setEditing(true)}
						aria-label={label}
						className={`min-w-0 flex-1 text-left leading-snug break-words hyphens-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
							fixed ? '' : 'cursor-grab active:cursor-grabbing'
						}`}
					>
						{title}
					</button>

					{(notes.length > 0 || detailContent !== undefined) && (
						<button
							type="button"
							onClick={onToggleDetail}
							aria-expanded={detailOpen}
							aria-label={`${detailOpen ? 'Hide' : 'Show'} ${detailName} on ${title}`}
							className="shrink-0 rounded-sm text-ink-muted transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand motion-reduce:transition-none dark:text-slate-400 dark:hover:text-sky-400"
						>
							<Icon name={detailOpen ? 'up' : 'down'} className="h-[1.05em] w-[1.05em]" />
						</button>
					)}

					<CardMenu label={label} actions={menu} />
				</div>
			)}

			{detailOpen && !editing && (
				<div className="mt-[0.25em] text-[0.8em] leading-snug text-ink-muted dark:text-slate-400">
					{detailContent}
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
									detailContent === undefined ? '' : 'mt-[0.35em]'
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
			 * order of least-to-most fixed: the sentence is what the card says,
			 * the tags are what somebody added to it, and the filing underneath
			 * is what another system owns.
			 */}
			<Tags tags={tags} owner={title} onTags={onTags} />

			{children}
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
		// A card's title is one line, so Enter is a verdict rather than a break.
		if (event.key === 'Enter') {
			event.preventDefault();
			onCommit(draft);
			return;
		}
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
 * The notes editor, where **Enter inserts a line break**.
 *
 * The opposite of the title editor, for the opposite reason: notes are prose,
 * and a prose box where Return commits is a box you cannot write a list in. A
 * blank line separates one note from the next.
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
			}}
			onBlur={() => onCommit(draft)}
			className="mt-[0.25em] w-full resize-none rounded-sm bg-white/70 px-[0.2em] py-[0.1em] text-[1em] leading-snug text-ink focus-visible:outline-2 focus-visible:outline-brand dark:bg-black/30 dark:text-slate-100"
		/>
	);
}
