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
import type { Panes } from '../../lib/storage.ts';
import { IconButton } from './IconButton.tsx';
import type { IconName } from '../../lib/board/icons.ts';
import { ProductPicker } from './ProductPicker.tsx';

/**
 * The three layouts, in the order the picker offers them.
 *
 * Both first because it is the default and the one most people stay on; then
 * the two single panes, source before board, matching the order they sit in on
 * screen.
 */
const PANE_CHOICES: readonly { panes: Panes; icon: IconName; label: string }[] = [
	{ panes: 'both', icon: 'panesBoth', label: 'Show the source and the wall' },
	{ panes: 'source', icon: 'panesSource', label: 'Show the source only' },
	{ panes: 'board', icon: 'panesBoard', label: 'Show the wall only' },
];

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
	panes,
	onPanes,
	onExport,
	onLoadSample,
	onOpenStore,
	saveState,
	onAddLane,
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
	dirty: boolean;
	canUndo: boolean;
	canRedo: boolean;
	onTitle: (title: string) => void;
	onPickFile: (file: File, input: HTMLInputElement) => void;
	/** Which panels are showing. The picker leads the view group. */
	panes: Panes;
	onPanes: (panes: Panes) => void;
	onExport: () => void;
	onLoadSample: () => void;
	onOpenStore: () => void;
	/** What the browser's copy last did, for the line beside the title. */
	saveState: { at: number } | { error: string } | null;
	onAddLane: () => void;
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
					{/* The one control that adds to the wall. */}
					<IconButton icon="addActivity" label="Add a lane" onClick={onAddLane} />

					<span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />

					{/* What was just done to it. */}
					<IconButton icon="undo" label="Undo" onClick={onUndo} disabled={!canUndo} />
					<IconButton icon="redo" label="Redo" onClick={onRedo} disabled={!canRedo} />

					<span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />

					{/*
					 * The layout picker leads the view group, because it decides what
					 * the rest of these are even acting on. ba-ddd-mapper's, button for
					 * button and in its order.
					 *
					 * It replaced the preview dialog. Previewing the file was worth a
					 * modal only while the file was something the board *rendered* on
					 * demand; now it is the document, it is on screen beside the wall,
					 * and a dialog showing you what you are already looking at would be
					 * a second copy to keep in step.
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
					{/*
					 * Plain, where doc-sm and doc-em still fill it.
					 *
					 * The filled treatment was there because Export was the only way work
					 * left this tab: it was the one control that saved anything, so it
					 * was the one control that had to be findable. Neither half of that
					 * is true here any more — the board writes itself to this browser a
					 * second after it stops changing, and the store panel says what it
					 * holds. Export is now one file gesture among four, and a filled
					 * button claiming otherwise would be pointing at the wrong thing.
					 */}
					<IconButton icon="exportFile" label="Export the .eventstorm file" onClick={onExport} />

					{/* No Save button. The board writes itself to this browser a second
					    after it stops changing, as ba-ddd-mapper's editors do — see the
					    background save in EventStormBoard. What is left here is the way
					    to *see* what was written. */}
					<IconButton icon="store" label="What this browser is holding" onClick={onOpenStore} />
					{/* The example sits with the file controls rather than beside Add:
					    it replaces the document, which is what everything else in this
					    group does. ba-ddd-mapper keeps its sample here too. */}
					<IconButton icon="example" label="Load the example" onClick={onLoadSample} />

					<span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />

					{/* How the wall is being looked at: its own theme, how close, and
					    whether it has the whole screen. None of them change the file. */}
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

