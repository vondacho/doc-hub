/**
 * An example's scenario, as editable Given / When / Then lines.
 *
 *     Given a voucher that expired on 2026-08-21
 *     And a basket of 40 CHF
 *     When the voucher is applied
 *     Then the voucher is refused
 *
 * The same object as doc-sm's `StoryNeed`, for the same reason: a formal
 * sentence with blanks in it teaches the notation far better than an empty text
 * box does. An example card that has never been touched still shows
 * `Given … When … Then …` in grey, so the shape of a scenario is visible before
 * anybody types.
 *
 * ## `And` is rendered, never stored
 *
 * The keyword on each line comes from `stepLines`, which prints the clause word
 * for the first step of a clause and `And` for every one after it. So adding a
 * second `Given` turns the line below it into `And` on its own, and deleting the
 * first promotes the second — without anything in the model changing meaning.
 * That is the whole reason the model keeps three lists rather than one ordered
 * list of typed steps.
 *
 * ## Clearing a line deletes it
 *
 * There is no delete control per line. Emptying the text is what a person tries
 * first, and it already means "I did not want this step", so it is what removes
 * it. The template line for an empty clause cannot be deleted because it is not
 * there — it is a placeholder that becomes a step the moment it is written.
 *
 * ## Enter commits
 *
 * A step is one line of a scenario, never several, so Enter is a verdict here
 * exactly as it is on a title. Anything pasted with breaks in it is collapsed by
 * the reducer rather than written into a feature file that would not parse.
 */

import { useEffect, useRef, useState } from 'react';
import { stepLines, type StepClause } from '../../lib/examplemap/model.ts';
import type { Example } from '../../lib/board/state.ts';

export function ExampleSteps({
	example,
	onStep,
}: {
	example: Example;
	onStep: (clause: StepClause, index: number, text: string) => void;
}) {
	const [editing, setEditing] = useState<string | null>(null);

	return (
		<div className="flex flex-col font-mono text-[0.95em]">
			{stepLines(example).map((line) => {
				const key = `${line.clause}:${line.index}`;
				const written = line.value !== null;

				if (editing === key) {
					return (
						<StepEditor
							key={key}
							value={line.value ?? ''}
							label={`${line.keyword} — step of "${example.title}"`}
							onCommit={(next) => {
								setEditing(null);
								onStep(line.clause, line.index, next);
							}}
							onCancel={() => setEditing(null)}
						/>
					);
				}

				return (
					<p key={key} className="break-words hyphens-auto">
						{/* The keyword is not part of the editable text: it is derived, and
						    letting somebody type over it would let the file say `Given` where
						    the model says `then`. */}
						<span className="font-semibold">{line.keyword} </span>
						<button
							type="button"
							onClick={() => setEditing(key)}
							aria-label={
								written
									? `Edit "${line.keyword} ${line.value}"`
									: `Write the ${line.keyword === 'And' ? 'next' : line.keyword} step of "${example.title}"`
							}
							className={`text-left underline decoration-dotted underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand ${
								written ? '' : 'italic opacity-70'
							}`}
						>
							{written ? line.value : line.placeholder}
						</button>
					</p>
				);
			})}
		</div>
	);
}

function StepEditor({
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
