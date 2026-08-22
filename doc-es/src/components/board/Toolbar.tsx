/**
 * The controls above the board.
 *
 * doc-sm's rows, with doc-es's verbs. One export button, where doc-em has two:
 * an event storm has one artefact. Its output is a shared picture and a set of
 * seams, and what the workshop leads to — a C4 model, a set of registered
 * events, a story map — is built in another tool by a person rather than
 * generated from here.
 *
 * Two rows, not one. What the storm is *about* — the product — sits above what
 * it is *called* and what you can do to it, because it is the larger claim and
 * it changes least often.
 *
 * There is no ticketing space beside the product, where doc-sm and doc-em both
 * have one. A space is where work is raised, and an event storm does not produce
 * work: it produces a shared picture and a set of seams. The story map next door
 * is where the work is cut.
 */

import { useRef, useState } from 'react';
import { EVENTSTORM_ACCEPT } from '../../lib/files.ts';
import type { Product } from '../../lib/products.ts';
import { IconButton } from './IconButton.tsx';
import { ProductPicker } from './ProductPicker.tsx';

export function Toolbar({
	title,
	product,
	products,
	productsUnavailable,
	registryUrl,
	onProduct,
	dirty,
	canUndo,
	canRedo,
	onTitle,
	onPickFile,
	onExport,
	onPreview,
	onLoadSample,
	onSave,
	onOpenSaved,
	saveState,
	onAddPhase,
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
	product: string | null;
	products: readonly Product[];
	productsUnavailable: string | null;
	registryUrl: string;
	onProduct: (product: string | null) => void;
	dirty: boolean;
	canUndo: boolean;
	canRedo: boolean;
	onTitle: (title: string) => void;
	onPickFile: (file: File, input: HTMLInputElement) => void;
	onExport: () => void;
	onPreview: () => void;
	onLoadSample: () => void;
	onSave: () => void;
	onOpenSaved: () => void;
	/** What the browser's copy last did, for the line beside the title. */
	saveState: { at: number } | { error: string } | null;
	onAddPhase: () => void;
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
		<div className="flex flex-col gap-2">
			{/* Above the title on purpose: an event storm is about a product first,
			    and is called something second. */}
			<div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
				<ProductPicker
					product={product}
					products={products}
					unavailable={productsUnavailable}
					registryUrl={registryUrl}
					onChange={onProduct}
				/>
			</div>

			<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
				<label className="sr-only" htmlFor="map-title">
					Event storm title
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

				{/*
				 * One line for two different facts, because they answer one question.
				 *
				 * "Unexported changes" is about the *file* — the thing that outlives
				 * this browser. A storage failure outranks it: it is the only one of
				 * the two that needs anybody to do anything, and it means the
				 * insurance everybody assumes is running is not.
				 */}
				<span
					className={`text-xs ${
						saveState !== null && 'error' in saveState
							? 'text-critical'
							: dirty
								? 'text-ink-muted dark:text-slate-400'
								: 'text-transparent'
					}`}
					aria-live="polite"
				>
					{saveState !== null && 'error' in saveState ? saveState.error : dirty ? 'Unexported changes' : ''}
				</span>

				<div className="flex flex-wrap items-center gap-1">
					<IconButton icon="undo" label="Undo" onClick={onUndo} disabled={!canUndo} />
					<IconButton icon="redo" label="Redo" onClick={onRedo} disabled={!canRedo} />

					<span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />

					<IconButton icon="addActivity" label="Add a phase" onClick={onAddPhase} />
				{/* Two buttons and not one with a menu: there are two kinds, the
				    choice is the whole decision, and a sprint is added far more
				    often than a release. */}
					<IconButton icon="example" label="Load the example" onClick={onLoadSample} />

					<span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />

					<IconButton icon="save" label="Save to this browser now" onClick={onSave} />
					<IconButton icon="folder" label="Open a board saved in this browser" onClick={onOpenSaved} />

					<span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />

					<IconButton icon="importFile" label="Import an .eventstorm file" onClick={() => fileInput.current?.click()} />
					<input
						ref={fileInput}
						type="file"
						accept={EVENTSTORM_ACCEPT}
						className="sr-only"
						onChange={(event) => {
							const file = event.target.files?.[0];
							if (file) onPickFile(file, event.target);
						}}
					/>
					<IconButton icon="preview" label="Preview the .eventstorm file" onClick={onPreview} />
					<IconButton icon="exportFile" label="Export the .eventstorm file" onClick={onExport} tone="primary" />

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
		</div>
	);
}

