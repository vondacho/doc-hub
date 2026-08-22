/**
 * The story's need, as three editable lines.
 *
 *     As a Support engineer,
 *     I want to redeem a voucher at checkout,
 *     so that the discount comes off the basket.
 *
 * One line per clause, each wrapping on its own, because the DSL models them as
 * three fields. Composing them into a single sentence reads well and edits
 * terribly: a sentence can only be replaced whole, where three lines can each be
 * corrected on their own.
 *
 * ## Every clause is a text box, the persona included
 *
 * This is the one place doc-sm's version of this component and this one
 * genuinely differ. There, a story may only name a persona its own activity
 * lists, so the control is a `select` over exactly those — free text would let a
 * story be written for somebody the activity never mentioned, producing a file
 * that then fails to re-import.
 *
 * There is no cast on this board. Example mapping takes one story that some
 * other conversation already chose, and there is nothing here to declare a
 * persona against — so a dropdown would have nothing to offer, and offering an
 * empty one would read as "there are no personas" rather than "this board does
 * not have that idea". It is typed, like the other two.
 *
 * ## Enter commits
 *
 * The opposite of the notes editor, and for the opposite reason: a clause is one
 * clause of one sentence, never several lines. A break inside one would be a
 * break in the middle of the sentence, so Enter means "done" here exactly as it
 * does on a title. The parser collapses whitespace inside a clause anyway, so a
 * break would not survive the file either.
 */

import { useEffect, useRef, useState } from 'react';
import { needLines, type NeedField } from '../../lib/examplemap/model.ts';
import type { Story } from '../../lib/board/state.ts';

export function StoryNeed({
	story,
	onClause,
}: {
	story: Story;
	onClause: (field: NeedField, text: string) => void;
}) {
	const [editing, setEditing] = useState<NeedField | null>(null);

	return (
		<div className="flex flex-col">
			{needLines(story).map((line) => {
				const written = line.value !== null;
				const field = line.field;

				if (editing === field) {
					return (
						<ClauseEditor
							key={field}
							value={line.value ?? ''}
							label={line.prefix.trim()}
							onCommit={(next) => {
								setEditing(null);
								onClause(field, next);
							}}
							onCancel={() => setEditing(null)}
						/>
					);
				}

				return (
					<p key={field} className="break-words hyphens-auto">
						<span>{line.prefix}</span>
						<button
							type="button"
							onClick={() => setEditing(field)}
							aria-label={`Edit "${line.prefix.trim()}" for ${story.title}`}
							className={`text-left underline decoration-dotted underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand ${
								written ? '' : 'italic opacity-70'
							}`}
						>
							{written ? line.value : line.placeholder}
						</button>
						{written && <span>{line.suffix}</span>}
					</p>
				);
			})}
		</div>
	);
}

function ClauseEditor({
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

	return (
		<textarea
			ref={ref}
			rows={2}
			value={draft}
			aria-label={label}
			onChange={(event) => setDraft(event.target.value)}
			onKeyDown={(event) => {
				// One clause, one line: Enter is a verdict here, not a break.
				if (event.key === 'Enter') {
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
			className="my-[0.15em] w-full resize-none rounded-sm bg-white/70 px-[0.2em] py-[0.1em] text-[1em] leading-snug text-ink focus-visible:outline-2 focus-visible:outline-brand dark:bg-black/30 dark:text-slate-100"
		/>
	);
}
