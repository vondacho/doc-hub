/**
 * The tags on a card: a row of chips, and the one-line editor behind it.
 *
 * A tag is a free label — `+legal`, `+risk`, `+"ask the payments team"` — and
 * every kind of note takes any number of them. What one *is*, and why the
 * vocabulary is open and the chips are not coloured, is argued once in
 * src/lib/eventstorm/model.ts beside `tagKey`; this file is only how it looks.
 *
 * ## Sized against the note, not against the board
 *
 * Every measurement here is in `em`, so the chips scale with the sticky they
 * sit on — and the stickies on this wall are deliberately small, because the
 * point of the board is seeing forty of them at once. They are proportionally
 * larger than doc-em's and doc-sm's for that reason: a chip at the same
 * fraction of a note this size would be unreadable.
 *
 * ## Why the whole row is one button
 *
 * Because tags are a set, and the thing somebody wants to do to a set is
 * rarely "change the third one". They arrive in handfuls, get renamed
 * together, and are cleared in one go when a session decides the labelling was
 * wrong. A chip that was individually clickable would also have to be
 * individually deletable, which means an `×` on every chip — five hit targets
 * and five pieces of furniture on a card whose actual content is one sentence.
 *
 * So the row opens one editor holding all of them, which is exactly how the
 * notes on the same card behave, and for the same reason.
 *
 * ## Commas, not spaces
 *
 * The file separates tags with spaces and quotes the ones that contain any.
 * That is right for a format a parser reads and wrong for a box a person types
 * into: it would mean explaining quoting to somebody who wants to write
 * `needs legal`. Commas need no explanation and no escape, and `quoteIfNeeded`
 * puts the quotes back on the way to the file.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { tagKey } from '../../lib/eventstorm/model.ts';

/**
 * What the editor's line means, as a list of tags.
 *
 * Blank entries are dropped, so a trailing comma is not a tag and neither is
 * `legal,, risk` — a person typing a list produces both, and neither is a
 * request for an empty label.
 *
 * Case-duplicates are dropped too, keeping the first. The parser refuses a card
 * tagged `+Legal +legal`, so admitting one here would let the board write a
 * file it then reports as broken — the board must not be able to author a
 * problem the author never typed.
 */
export function splitTags(text: string): readonly string[] {
	const tags: string[] = [];
	for (const part of text.split(',')) {
		const tag = part.trim();
		if (tag === '') continue;
		if (tags.some((seen) => tagKey(seen) === tagKey(tag))) continue;
		tags.push(tag);
	}
	return tags;
}

/** The line the editor opens with. */
export function joinTags(tags: readonly string[]): string {
	return tags.join(', ');
}

/**
 * The name a fresh tag gets, which is a placeholder and looks like one.
 *
 * Numbered up rather than refused when it is taken, because the gesture that
 * adds one is a menu item that has to do something every time it is clicked —
 * and two cards both waiting to be labelled is an ordinary state a few seconds
 * into tagging a board.
 */
export function newTag(taken: readonly string[]): string {
	const base = 'new-tag';
	if (!taken.some((tag) => tagKey(tag) === base)) return base;
	for (let n = 2; ; n += 1) {
		const candidate = `${base}-${n}`;
		if (!taken.some((tag) => tagKey(tag) === candidate)) return candidate;
	}
}

export function Tags({
	tags,
	owner,
	onTags,
}: {
	readonly tags: readonly string[];
	/** The card's title, for the accessible name — "the tags on …". */
	readonly owner: string;
	readonly onTags: (tags: readonly string[]) => void;
}) {
	const [editing, setEditing] = useState(false);

	// Nothing to show and nothing to open. A card with no tags is the common
	// case, and an empty row would put a blank line under every card on the
	// board to advertise a feature most of them are not using. Tagging one
	// starts from the card menu instead.
	if (tags.length === 0 && !editing) return null;

	if (editing) {
		return (
			<TagLine
				value={joinTags(tags)}
				label={`Tags on ${owner}`}
				onCommit={(next) => {
					setEditing(false);
					onTags(splitTags(next));
				}}
				onCancel={() => setEditing(false)}
			/>
		);
	}

	return (
		<button
			type="button"
			onClick={() => setEditing(true)}
			aria-label={`Edit the tags on ${owner}: ${tags.join(', ')}`}
			className="mt-[0.2em] flex flex-wrap items-center gap-[0.2em] rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand"
		>
			{/*
			 * `border-current` and `opacity`, not the `ink` tokens the rest of the
			 * app uses. A sticky here is one of ten background colours and sets
			 * its own text colour to stay legible on it; a chip painted in the
			 * board's ink would be the one element on the note that ignores which
			 * colour the note is. Borrowing the note's own colour at reduced
			 * weight keeps it subordinate on all ten, in both themes, with no
			 * per-kind table to keep in step with `cardClass`.
			 */}
			{tags.map((tag) => (
				<span
					key={tag}
					className="rounded-full border border-current/30 px-[0.35em] text-[0.85em] font-medium whitespace-nowrap opacity-70"
				>
					{tag}
				</span>
			))}
		</button>
	);
}

/**
 * One line of comma-separated tags.
 *
 * An `input` rather than a `textarea`, unlike the notes editor beside it: a
 * list of labels is one line by definition, and Enter therefore means "done"
 * the way it does in the title editor rather than "new paragraph".
 */
function TagLine({
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
	const ref = useRef<HTMLInputElement>(null);

	useEffect(() => {
		ref.current?.focus();
		ref.current?.select();
	}, []);

	const keys = (event: KeyboardEvent<HTMLInputElement>) => {
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
		<input
			ref={ref}
			type="text"
			value={draft}
			aria-label={label}
			placeholder="legal, risk"
			onChange={(event) => setDraft(event.target.value)}
			onKeyDown={keys}
			onBlur={() => onCommit(draft)}
			className="mt-[0.2em] w-full rounded-sm bg-white/70 px-[0.2em] text-[0.9em] text-ink focus-visible:outline-2 focus-visible:outline-brand dark:bg-black/30 dark:text-slate-100"
		/>
	);
}
