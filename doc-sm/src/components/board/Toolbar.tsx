/**
 * The controls above the board: the map's title, import, export, undo, and the
 * two "add" affordances that have nowhere else to live.
 *
 * Export is the only thing here that persists anything, anywhere. doc-sm has no
 * database and no autosave by design, so this row is the whole save story — and
 * that is why the dirty marker next to it is not decoration.
 */

import { useRef, useState } from 'react';
import { STORYMAP_ACCEPT } from '../../lib/files.ts';

const BUTTON =
	'rounded-full border border-slate-300 px-3.5 py-1.5 text-sm font-semibold transition hover:border-brand hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-300 disabled:hover:text-inherit motion-reduce:transition-none dark:border-slate-600 dark:hover:border-sky-400 dark:hover:text-sky-400';

const PRIMARY =
	'rounded-full bg-brand px-3.5 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-strong focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand motion-reduce:transition-none';

export function Toolbar({
	title,
	dirty,
	canUndo,
	canRedo,
	onTitle,
	onPickFile,
	onExport,
	onLoadSample,
	onAddActivity,
	onAddRelease,
	onUndo,
	onRedo,
}: {
	title: string;
	dirty: boolean;
	canUndo: boolean;
	canRedo: boolean;
	onTitle: (title: string) => void;
	onPickFile: (file: File, input: HTMLInputElement) => void;
	onExport: () => void;
	onLoadSample: () => void;
	onAddActivity: () => void;
	onAddRelease: () => void;
	onUndo: () => void;
	onRedo: () => void;
}) {
	const fileInput = useRef<HTMLInputElement>(null);
	const [draft, setDraft] = useState(title);

	// The title input is uncontrolled between renders of the board but must
	// follow an import, which replaces it wholesale.
	const [seen, setSeen] = useState(title);
	if (seen !== title) {
		setSeen(title);
		setDraft(title);
	}

	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
			<label className="sr-only" htmlFor="map-title">
				Story map title
			</label>
			<input
				id="map-title"
				value={draft}
				onChange={(event) => setDraft(event.target.value)}
				onBlur={() => onTitle(draft)}
				onKeyDown={(event) => {
					if (event.key === 'Enter') event.currentTarget.blur();
				}}
				className="min-w-56 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-xl font-bold hover:border-slate-300 focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-brand dark:hover:border-slate-600"
			/>

			{/* Not a warning, just a fact. doc-sm keeps nothing, so "unexported"
			    is the only state worth surfacing, and it is what the beforeunload
			    guard keys off. */}
			<span
				className={`text-xs ${dirty ? 'text-ink-muted dark:text-slate-400' : 'text-transparent'}`}
				aria-live="polite"
			>
				{dirty ? 'Unexported changes' : ''}
			</span>

			<div className="flex flex-wrap items-center gap-2">
				<button type="button" className={BUTTON} onClick={onUndo} disabled={!canUndo}>
					Undo
				</button>
				<button type="button" className={BUTTON} onClick={onRedo} disabled={!canRedo}>
					Redo
				</button>
				<button type="button" className={BUTTON} onClick={onAddActivity}>
					Add activity
				</button>
				<button type="button" className={BUTTON} onClick={onAddRelease}>
					Add release
				</button>
				<button type="button" className={BUTTON} onClick={onLoadSample}>
					Load the example
				</button>

				<button type="button" className={BUTTON} onClick={() => fileInput.current?.click()}>
					Import…
				</button>
				<input
					ref={fileInput}
					type="file"
					accept={STORYMAP_ACCEPT}
					className="sr-only"
					// Driven by the button above rather than styled directly: a file
					// input cannot be made to look like the rest of this row, and a
					// bare one next to five pills reads as an unfinished page.
					onChange={(event) => {
						const file = event.target.files?.[0];
						if (file) onPickFile(file, event.target);
					}}
				/>

				<button type="button" className={PRIMARY} onClick={onExport}>
					Export
				</button>
			</div>
		</div>
	);
}
