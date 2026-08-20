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
	onLoadSample,
	onAddActivity,
	onAddRelease,
	onUndo,
	onRedo,
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
		<div className="flex flex-col gap-2">
			{/* Above the title on purpose: a story map is about a product first,
			    and is called something second. */}
			<ProductPicker
				product={product}
				products={products}
				unavailable={productsUnavailable}
				registryUrl={registryUrl}
				onChange={onProduct}
			/>

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
						icon="exportFile"
						label="Export the .storymap file"
						onClick={onExport}
						tone="primary"
					/>
				</div>
			</div>
		</div>
	);
}
