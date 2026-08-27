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
import type { Panes } from '../../lib/storage.ts';
import { IconButton } from './IconButton.tsx';
import type { IconName } from '../../lib/board/icons.ts';
import { ProductPicker } from './ProductPicker.tsx';

/**
 * The three layouts, in the order the picker offers them.
 *
 * Left to right as the panes sit on screen: source alone, source beside the map,
 * map alone. The middle button is the default, which puts the one most people
 * stay on in the middle of the three rather than at the head of them — the
 * picker reads as a slider between two extremes, which is what it is.
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
	dirty,
	canUndo,
	canRedo,
	onTitle,
	onPickFile,
	panes,
	onPanes,
	onExport,
	onPublish,
	publishCount,
	publishReason,
	space,
	spacePlaceholder,
	onSpace,
	onLoadSample,
	onOpenStore,
	saveState,
	onAddActivity,
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
	dirty: boolean;
	canUndo: boolean;
	canRedo: boolean;
	onTitle: (title: string) => void;
	onPickFile: (file: File, input: HTMLInputElement) => void;
	/** Which panels are showing. The picker leads the view group. */
	panes: Panes;
	onPanes: (panes: Panes) => void;
	onExport: () => void;
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
	onOpenStore: () => void;
	/** What the browser's copy last did, for the line beside the title. */
	saveState: { at: number } | { error: string } | null;
	onAddActivity: () => void;
	onAddSprint: () => void;
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
	/** What the board is showing now, whether pinned or following the page. */
	boardIsDark: boolean;
	/** Whether the visitor has pinned it, as opposed to following along. */
	themePinned: boolean;
	onFlipTheme: () => void;
	onFollowPage: () => void;

	/** True when at least one card's detail is open. */
	/** Whether the notation is on screen. The button is a toggle, not an action. */
	legendShown: boolean;
	onToggleLegend: () => void;
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

				{/* Grouped by what they do, with a rule between the groups: history,
				    then things that add to the board, then the file. One unbroken run of
				    eight identical circles would be a worse toolbar than eight pills. */}
				<div className="flex flex-wrap items-center gap-1">
					{/* What the board is made of: the backbone, and the bands of the timeline. */}
					<IconButton icon="addActivity" label="Add activity" onClick={onAddActivity} />
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
					 * the rest of these are even acting on. ba-ddd-mapper's, button for
					 * button and in its order.
					 *
					 * It replaced the preview dialog. Previewing the file was worth a
					 * modal only while the file was something the board *rendered* on
					 * demand; now it is the document, on screen beside the map, and a
					 * dialog showing you what you are already looking at would be a
					 * second copy to keep in step.
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
								? 'Nothing on this board has a cast, a need or a note yet'
								: detailShown
									? 'Hide every cast, need and note'
									: 'Show every cast, need and note'
						}
						onClick={onToggleAllDetail}
						disabled={!canToggleDetail}
					/>

					<span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />

					{/* The file, and the browser's copy of it. */}
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
					<IconButton
						icon="exportFile"
						label="Export the .storymap file"
						onClick={onExport}
					/>

					{/* No Save button. The board writes itself to this browser a second
					    after it stops changing, as ba-ddd-mapper's editors do — see the
					    background save in StoryMapBoard. What is left here is the way to
					    *see* what was written. */}
					<IconButton icon="store" label="What this browser is holding" onClick={onOpenStore} />
					<IconButton icon="example" label="Load the example" onClick={onLoadSample} />

					<span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />

					{/* Ticketing: the one control that reaches another system. */}
					<IconButton
						icon="publish"
						label={
							publishReason ??
							`Publish ${publishCount} unlinked ${publishCount === 1 ? 'story' : 'stories'} as tickets`
						}
						onClick={onPublish}
						disabled={publishReason !== undefined}
					/>

					<span className="mx-1 h-6 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />

					{/* How the board is being looked at. None of these change the file. */}
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
