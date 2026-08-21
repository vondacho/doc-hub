/**
 * The controls above the board: the product, the map's title, and the actions.
 *
 * Export is the only thing here that persists anything, anywhere. doc-sm has no
 * database and no autosave by design, so this row is the whole save story — and
 * that is why the dirty marker beside it is not decoration, and why Export keeps
 * the filled treatment now that it has no words.
 *
 * The actions are icons. Eight labelled pills wrapped onto two lines on a laptop
 * and pushed the board below the fold, which on a tool whose whole point is
 * seeing a wall of cards at once is a real cost. Every one of them still carries
 * its words in an `aria-label` and in a tooltip that appears on hover *and* on
 * keyboard focus — see IconButton.
 */

import { useRef, useState } from 'react';
import { STORYMAP_ACCEPT } from '../../lib/files.ts';
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
	onPublish,
	publishCount,
	publishReason,
	space,
	spacePlaceholder,
	onSpace,
	onLoadSample,
	onAddActivity,
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
	dirty: boolean;
	canUndo: boolean;
	canRedo: boolean;
	onTitle: (title: string) => void;
	onPickFile: (file: File, input: HTMLInputElement) => void;
	onExport: () => void;
	onPreview: () => void;
	onPublish: () => void;
	/** How many stories publishing would raise a ticket for. */
	publishCount: number;
	/** Why publishing is unavailable, or undefined when it is. */
	publishReason: string | undefined;
	space: string | null;
	/** Shown when no space is stated — the product it would fall back to. */
	spacePlaceholder: string;
	onSpace: (space: string | null) => void;
	onLoadSample: () => void;
	onAddActivity: () => void;
	onAddRelease: () => void;
	onUndo: () => void;
	onRedo: () => void;
	/** 1 is 100%. Shown as a percentage and resettable by clicking it. */
	zoom: number;
	canZoomIn: boolean;
	canZoomOut: boolean;
	onZoomIn: () => void;
	onZoomOut: () => void;
	onZoomReset: () => void;
	fullscreen: boolean;
	onToggleFullscreen: () => void;
	/** True when at least one card's detail is open. */
	detailShown: boolean;
	/** False when nothing on the board has any detail to show. */
	canToggleDetail: boolean;
	onToggleAllDetail: () => void;
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
		<div className="flex flex-col gap-2">
			{/* Above the title on purpose: a story map is about a product first,
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

				{/* Grouped by what they do, with a rule between the groups: history,
				    then things that add to the board, then the file. One unbroken run of
				    eight identical circles would be a worse toolbar than eight pills. */}
				<div className="flex flex-wrap items-center gap-1">
					<IconButton icon="undo" label="Undo" onClick={onUndo} disabled={!canUndo} />
					<IconButton icon="redo" label="Redo" onClick={onRedo} disabled={!canRedo} />

					<span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />

					<IconButton icon="addActivity" label="Add activity" onClick={onAddActivity} />
					<IconButton icon="addRelease" label="Add release" onClick={onAddRelease} />
					<IconButton icon="example" label="Load the example" onClick={onLoadSample} />

					<span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />

					<IconButton
						icon="importFile"
						label="Import a .storymap file"
						onClick={() => fileInput.current?.click()}
					/>
					<input
						ref={fileInput}
						type="file"
						accept={STORYMAP_ACCEPT}
						className="sr-only"
						// Driven by the button above rather than styled directly: a file
						// input cannot be made to look like the rest of this row.
						onChange={(event) => {
							const file = event.target.files?.[0];
							if (file) onPickFile(file, event.target);
						}}
					/>
					<IconButton icon="preview" label="Preview the .storymap file" onClick={onPreview} />
					<IconButton
						icon="publish"
						label={
							publishReason ??
							`Publish ${publishCount} unlinked ${publishCount === 1 ? 'story' : 'stories'} as tickets`
						}
						onClick={onPublish}
						disabled={publishReason !== undefined}
					/>
					<IconButton
						icon="exportFile"
						label="Export the .storymap file"
						onClick={onExport}
						tone="primary"
					/>

					<span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />

					{/* View controls last: they change nothing, which is exactly why
					    they sit furthest from the ones that do. */}
					<IconButton
						icon={detailShown ? 'collapseAll' : 'expandAll'}
						label={
							!canToggleDetail
								? 'Nothing on this board has a cast, a need or a note yet'
								: detailShown
									? 'Hide every cast, need and note'
									: 'Show every cast, need and note'
						}
						onClick={onToggleAllDetail}
						disabled={!canToggleDetail}
					/>
					<IconButton
						icon="zoomOut"
						label="Zoom out"
						onClick={onZoomOut}
						disabled={!canZoomOut}
					/>
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
