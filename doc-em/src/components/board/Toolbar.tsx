/**
 * The controls above the board.
 *
 * doc-sm's rows, with doc-em's verbs. Export is two buttons rather than one,
 * because an example map has two artefacts and they are not interchangeable:
 * the `.examplemap` file is the map and round-trips, the `.feature` file is what
 * the map produced and is a one-way door.
 *
 * Two rows, not one. What the map is *about* — the product, and the space its
 * ticket lives in — sits above what the map is *called* and what you can do to
 * it, because it is the larger claim and it changes least often.
 */

import { useRef, useState } from 'react';
import { EXAMPLEMAP_ACCEPT } from '../../lib/files.ts';
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
	space,
	spacePlaceholder,
	onSpace,
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
	onAddSprint,
	onAddRelease,
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
	space: string | null;
	/** Shown when no space is stated — the product it would fall back to. */
	spacePlaceholder: string;
	onSpace: (space: string | null) => void;
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
	onAddSprint: () => void;
	onAddRelease: () => void;
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
			{/* Above the title on purpose: an example map is about a product first,
			    and is called something second. */}
			<div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
				<ProductPicker
					product={product}
					products={products}
					unavailable={productsUnavailable}
					registryUrl={registryUrl}
					onChange={onProduct}
				/>
				<SpaceField value={space} placeholder={spacePlaceholder} onChange={onSpace} />
			</div>

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
				{/* Two buttons and not one with a menu: there are two kinds, the
				    choice is the whole decision, and a sprint is added far more
				    often than a release. */}
				<IconButton icon="addRelease" label="Add a sprint" onClick={onAddSprint} />
				<IconButton icon="flag" label="Add a release" onClick={onAddRelease} />
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
					<IconButton icon="preview" label="Preview the .examplemap and .feature files" onClick={onPreview} />
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
		</div>
	);
}

/**
 * The ticketing space, beside the product because it is usually the same word
 * and always the neighbouring question.
 *
 * Empty means "follow the product", and the placeholder shows which product that
 * is — so the field reads as already answered rather than as a blank somebody
 * must fill in. Committed on blur, like every other field here, which keeps a
 * change to one undo step.
 */
function SpaceField({
	value,
	placeholder,
	onChange,
}: {
	value: string | null;
	placeholder: string;
	onChange: (space: string | null) => void;
}) {
	const id = 'ticketing-space';
	const [draft, setDraft] = useState(value ?? '');

	// Follows an import or a product change, which replace it from outside.
	const [seen, setSeen] = useState(value);
	if (seen !== value) {
		setSeen(value);
		setDraft(value ?? '');
	}

	return (
		<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
			<label
				htmlFor={id}
				className="text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase dark:text-slate-400"
			>
				Ticketing space
			</label>
			<input
				id={id}
				value={draft}
				placeholder={placeholder === '' ? 'none' : placeholder}
				onChange={(event) => setDraft(event.target.value)}
				onBlur={() => onChange(draft.trim() === '' ? null : draft.trim())}
				onKeyDown={(event) => {
					if (event.key === 'Enter') event.currentTarget.blur();
				}}
				className="w-36 rounded-lg border border-slate-300 bg-transparent px-2 py-1 font-mono text-sm focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-brand dark:border-slate-600"
			/>
		</div>
	);
}
