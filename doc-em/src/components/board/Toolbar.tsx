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
import type { Panes } from '../../lib/storage.ts';
import { IconButton } from './IconButton.tsx';
import type { IconName } from '../../lib/board/icons.ts';
import { ProductPicker } from './ProductPicker.tsx';

/**
 * The three layouts, in the order the picker offers them.
 *
 * Left to right as the panes sit on screen: source alone, source beside the
 * map, map alone. doc-es's and doc-sm's picker, button for button.
 */
const PANE_CHOICES: readonly { panes: Panes; icon: IconName; label: string }[] = [
	{ panes: 'source', icon: 'panesSource', label: 'Show the source only' },
	{ panes: 'both', icon: 'panesBoth', label: 'Show the source and the map' },
	{ panes: 'board', icon: 'panesBoard', label: 'Show the map only' },
];

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
	panes,
	onPanes,
	onFormat,
	onNew,
	onExport,
	onExportGherkin,
	onLoadSample,
	onOpenStore,
	saveState,
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
	boardIsDark,
	themePinned,
	onFlipTheme,
	onFollowPage,
	legendShown,
	onToggleLegend,
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
	/** Which panels are showing. The picker leads the view group. */
	panes: Panes;
	onPanes: (panes: Panes) => void;
	/** Reformat the source: indentation only. */
	onFormat: () => void;
	onNew: () => void;
	onExport: () => void;
	onExportGherkin: () => void;
	onLoadSample: () => void;
	onOpenStore: () => void;
	/** What the browser's copy last did, for the line beside the title. */
	saveState: { at: number } | { error: string } | null;
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
	/** What the board is showing now, whether pinned or following the page. */
	boardIsDark: boolean;
	/** Whether the visitor has pinned it, as opposed to following along. */
	themePinned: boolean;
	onFlipTheme: () => void;
	onFollowPage: () => void;

	/** Whether the notation is on screen. The button is a toggle, not an action. */
	legendShown: boolean;
	onToggleLegend: () => void;
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
					{/* What the board is made of: the rules, and the bands of the timeline. */}
					<IconButton icon="addActivity" label="Add a rule" onClick={onAddRule} />
				{/* Two buttons and not one with a menu: there are two kinds, the
				    choice is the whole decision, and a sprint is added far more
				    often than a release. */}
				<IconButton icon="addRelease" label="Add a sprint" onClick={onAddSprint} />
				<IconButton icon="flag" label="Add a release" onClick={onAddRelease} />

					<span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />

					{/* What was just done to it. */}
					<IconButton icon="undo" label="Undo" onClick={onUndo} disabled={!canUndo} />
					<IconButton icon="redo" label="Redo" onClick={onRedo} disabled={!canRedo} />

					<span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />

					{/*
					 * The layout picker leads the view group, because it decides what
					 * the rest are even acting on.
					 *
					 * It replaced the preview dialog, whose two tabs are now the left
					 * pane's — see SourcePane. Previewing was worth a modal only while
					 * the file was something the board *rendered* on demand; now it is
					 * the document, on screen beside the map.
					 */}
					<span role="group" aria-label="Panels" className="flex items-center gap-1">
						{PANE_CHOICES.map((choice) => (
							<IconButton
								key={choice.panes}
								icon={choice.icon}
								label={choice.label}
								pressed={panes === choice.panes}
								onClick={() => onPanes(choice.panes)}
							/>
						))}
					</span>
					{/* Beside the controls that decide what else is showing, because it
					    is the same question: which of the board's own furniture is on
					    screen. ba-ddd-mapper puts its legend toggle in the same place,
					    for the same reason. */}
					<IconButton
						icon="legend"
						label={legendShown ? 'Hide the legend' : 'Show the legend'}
						onClick={onToggleLegend}
						pressed={legendShown}
					/>
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

					<span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />

					{/* The file, and the browser's copy of it. */}
					{/* First of the document buttons, because it acts on what you are
					    typing rather than on where the file goes. */}
					<IconButton
						icon="format"
						label="Format the source: indentation only, nothing moves"
						onClick={onFormat}
					/>
					{/* Before Import, because it is the other way in and the one
					    somebody with nothing yet needs. */}
					<IconButton icon="newDoc" label="Start a new map. Nothing is lost — this one stays in the store." onClick={onNew} />
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
					<IconButton icon="exportFile" label="Export the .examplemap file" onClick={onExport} />
					{/* No Save button. The board writes itself to this browser a second
					    after it stops changing, as ba-ddd-mapper's editors do. What is
					    left here is the way to *see* what was written. */}
					<IconButton icon="store" label="What this browser is holding" onClick={onOpenStore} />
					<IconButton icon="example" label="Load the example" onClick={onLoadSample} />

					<span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />

					{/* The second artefact. doc-sm gives this slot to ticketing — the
					    one control that hands work to another system. Here it is the
					    feature file, which is the same kind of thing: what the session
					    produced, for somebody else to run. */}
					<IconButton icon="preview" label="Show the Gherkin feature file" onClick={onExportGherkin} />

					<span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />

					{/* How the board is being looked at. None of these change the file. */}
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

					<span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />

					{/*
					 * The board's own night/day switch.
					 *
					 * The icon is what you would get, not what you have — the usual
					 * convention for these, and the one that makes a single button
					 * legible without a label. Shift-clicking hands the board back to
					 * the page, which is the third state; it is on the modifier rather
					 * than on a third press because a three-way button whose third
					 * state is invisible is a button nobody can predict, and the
					 * accessible name says so out loud.
					 */}
					<IconButton
						icon={boardIsDark ? 'sun' : 'moon'}
						label={
							themePinned
								? `Show the board in ${boardIsDark ? 'daylight' : 'the dark'}. Shift-click to follow the page again.`
								: `Show the board in ${boardIsDark ? 'daylight' : 'the dark'}`
						}
						onClick={(event) => (event.shiftKey ? onFollowPage() : onFlipTheme())}
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
