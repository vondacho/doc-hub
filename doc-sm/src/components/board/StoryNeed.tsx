/**
 * A story's need, as three editable lines.
 *
 *     As a Business analyst,
 *     I want to search every product at once,
 *     so that I can answer a question without knowing which product owns it.
 *
 * One line per clause, each wrapping on its own, because the DSL models them as
 * three fields. Composing them into a single sentence — which is what this used
 * to do — reads well and edits terribly: a sentence can only be replaced whole,
 * where three lines can each be corrected on their own.
 *
 * ## The persona is a choice, not a text box
 *
 * A story may only name a persona its own activity lists, so this is a `select`
 * over exactly those. Typing it as free text would let a story be written for
 * somebody the activity never mentioned — a file that then fails to re-import,
 * which is the one failure the whole persona design exists to prevent.
 *
 * An activity with no cast yet gets a disabled control saying so rather than an
 * empty dropdown, which would read as "there are no personas" instead of "none
 * have been listed here".
 *
 * ## Enter commits
 *
 * The opposite of the notes editor, and for the opposite reason: `want` and `so`
 * are one clause of one sentence, never several lines. A break inside one would
 * be a break in the middle of the sentence, so Enter means "done" here exactly
 * as it does on a title. The file still wraps them to the 50-column measure —
 * that wrapping belongs to the file, not to the text.
 */

import { useEffect, useRef, useState } from 'react';
import { needLines, type NeedField } from '../../lib/storymap/model.ts';
import type { Story } from '../../lib/board/state.ts';

export function StoryNeed({
	story,
	personas,
	onPersona,
	onClause,
}: {
	story: Story;
	/** The personas this story's activity lists — the only legal choices. */
	personas: readonly string[];
	onPersona: (persona: string | null) => void;
	onClause: (field: 'want' | 'soThat', text: string) => void;
}) {
	const [editing, setEditing] = useState<NeedField | null>(null);

	return (
		<div className="flex flex-col">
			{needLines(story).map((line) => {
				const written = line.value !== null;

				if (line.field === 'persona') {
					return (
						<p key={line.field} className="break-words hyphens-auto">
							<span>{line.prefix}</span>
							<select
								value={line.value ?? ''}
								disabled={personas.length === 0}
								aria-label="Who this story is for"
								onChange={(event) => onPersona(event.target.value === '' ? null : event.target.value)}
								className="max-w-full rounded-sm border-0 bg-transparent p-0 text-[1em] underline decoration-dotted underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand disabled:no-underline"
							>
								<option value="">
									{personas.length === 0 ? 'nobody — this activity lists no personas' : line.placeholder}
								</option>
								{personas.map((persona) => (
									<option key={persona} value={persona}>
										{persona}
									</option>
								))}
							</select>
							{written && <span>{line.suffix}</span>}
						</p>
					);
				}

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
