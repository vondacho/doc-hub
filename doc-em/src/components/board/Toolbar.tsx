/**
 * The controls above the board.
 *
 * doc-sm's row, with doc-em's verbs. Export is two buttons rather than one,
 * because an example map has two artefacts and they are not interchangeable:
 * the `.examplemap` file is the map and round-trips, the `.feature` file is what
 * the map produced and is a one-way door.
 */

import { useRef, useState } from 'react';
import { EXAMPLEMAP_ACCEPT } from '../../lib/files.ts';
import { IconButton } from './IconButton.tsx';

export function Toolbar({
	title,
	dirty,
	canUndo,
	canRedo,
	onTitle,
	onPickFile,
	onExport,
	onExportGherkin,
	onPreview,
	onLoadSample,
	onAddRule,
	onUndo,
	onRedo,
	zoom,
	canZoomIn,
	canZoomOut,
	onZoomIn,
	onZoomOut,
	onZoomReset,
	fullscreen,
	onToggleFullscreen,
	detailShown,
	canToggleDetail,
	onToggleAllDetail,
}: {
	title: string;
	dirty: boolean;
	canUndo: boolean;
	canRedo: boolean;
	onTitle: (title: string) => void;
	onPickFile: (file: File, input: HTMLInputElement) => void;
	onExport: () => void;
	onExportGherkin: () => void;
	onPreview: () => void;
	onLoadSample: () => void;
	onAddRule: () => void;
	onUndo: () => void;
	onRedo: () => void;
	zoom: number;
	canZoomIn: boolean;
	canZoomOut: boolean;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onZoomReset: () => void;
	fullscreen: boolean;
	onToggleFullscreen: () => void;
	detailShown: boolean;
	canToggleDetail: boolean;
	onToggleAllDetail: () => void;
}) {
	const fileInput = useRef<HTMLInputElement>(null);
	const [draft, setDraft] = useState(title);

	// The title input follows an import, which replaces it wholesale.
	const [seen, setSeen] = useState(title);
	if (seen !== title) {
		setSeen(title);
		setDraft(title);
	}

	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
			<label className="sr-only" htmlFor="map-title">
				Example map title
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

			<span className={`text-xs ${dirty ? 'text-ink-muted dark:text-slate-400' : 'text-transparent'}`} aria-live="polite">
				{dirty ? 'Unexported changes' : ''}
			</span>

			<div className="flex flex-wrap items-center gap-1">
				<IconButton icon="undo" label="Undo" onClick={onUndo} disabled={!canUndo} />
				<IconButton icon="redo" label="Redo" onClick={onRedo} disabled={!canRedo} />

				<span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />

				<IconButton icon="addActivity" label="Add a rule" onClick={onAddRule} />
				<IconButton icon="example" label="Load the example" onClick={onLoadSample} />

				<span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />

				<IconButton icon="importFile" label="Import an .examplemap file" onClick={() => fileInput.current?.click()} />
				<input
					ref={fileInput}
					type="file"
					accept={EXAMPLEMAP_ACCEPT}
					className="sr-only"
					onChange={(event) => {
						const file = event.target.files?.[0];
						if (file) onPickFile(file, event.target);
					}}
				/>
				<IconButton icon="preview" label="Preview the .examplemap file" onClick={onPreview} />
				<IconButton icon="publish" label="Write the Gherkin feature file" onClick={onExportGherkin} />
				<IconButton icon="exportFile" label="Export the .examplemap file" onClick={onExport} tone="primary" />

				<span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />

				<IconButton
					icon={detailShown ? 'collapseAll' : 'expandAll'}
					label={
						!canToggleDetail
							? 'No card on this board has a note yet'
							: detailShown
								? 'Hide every note'
								: 'Show every note'
					}
					onClick={onToggleAllDetail}
					disabled={!canToggleDetail}
				/>
				<IconButton icon="zoomOut" label="Zoom out" onClick={onZoomOut} disabled={!canZoomOut} />
				<button
					type="button"
					onClick={onZoomReset}
					aria-label={`Zoom ${Math.round(zoom * 100)} percent. Reset to 100 percent.`}
					className="w-12 rounded-full px-1 py-1 text-xs font-semibold tabular-nums text-ink-muted transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none dark:text-slate-400 dark:hover:text-sky-400"
				>
					{Math.round(zoom * 100)}%
				</button>
				<IconButton icon="zoomIn" label="Zoom in" onClick={onZoomIn} disabled={!canZoomIn} />
				<IconButton
					icon={fullscreen ? 'fullscreenExit' : 'fullscreen'}
					label={fullscreen ? 'Leave fullscreen' : 'Fullscreen the board'}
					onClick={onToggleFullscreen}
				/>
			</div>
		</div>
	);
}
