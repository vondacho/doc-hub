/**
 * What this board would export — in both formats, on two tabs.
 *
 * Worth having because these files are the actual artefacts: they are what gets
 * committed and reviewed, and until this existed the only way to see either was
 * to download it.
 *
 * Built on the native `<dialog>` element rather than a div with a high z-index.
 * `showModal()` brings the focus trap, the inert background, the Escape key and
 * the top-layer stacking with it — all of which would otherwise be hand-written,
 * and three of which are usually hand-written wrong.
 *
 * ## Two tabs, and only one of them is a text box
 *
 * The **map** tab is the `.examplemap` file, and every line of it is editable:
 * everything in an example map is text somebody typed, so applying the text
 * replaces the board. For some changes it is plainly the better way in —
 * renaming six examples is a find-and-replace here and twelve clicks out there.
 *
 * The **Gherkin** tab is read-only, and that is the whole point of showing them
 * together. A feature file is what the map *produced*; nothing reads one back,
 * because the red cards have no Gherkin to be written as and could not be
 * recovered from one. A tab you could type into would promise a way back that
 * does not exist — so it is a `<pre>`, the apply control is not rendered beside
 * it, and the footer says why.
 *
 * ## The Gherkin follows the draft, not the board
 *
 * It is regenerated from whatever is currently in the map tab, so an edit there
 * shows up here immediately — which is most of the reason to put the two on
 * tabs rather than in two dialogs. While the draft does not parse there is no
 * feature file to show, and this says so with the problems rather than leaving
 * the last good render up, which would be a lie about text that no longer
 * exists.
 *
 * The dialog does not know how to parse or to write Gherkin. Both arrive as
 * functions from the board, the same way `onApply` does, which keeps the parser
 * out of a component whose job is a text box and two tabs.
 *
 * ## The text is a snapshot, not a live view
 *
 * The dialog is modal, so the board behind it cannot change while it is open.
 * The draft is seeded when the dialog opens and belongs to the visitor from then
 * on: it is not overwritten from the board, and closing without applying
 * discards it. The footer says so, because a text box that silently throws work
 * away is the wrong kind of surprise.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Problem } from '../../lib/examplemap/problems.ts';
import { IconButton } from './IconButton.tsx';
import { ProblemList } from './ProblemList.tsx';

/** Empty problems means the text was applied and the dialog may close. */
export type ApplyResult = readonly Problem[];

/**
 * The feature file for some `.examplemap` text, or why there is not one.
 *
 * A discriminated union rather than a string plus a flag: "there is no feature
 * file right now" is a state the pane has to render differently, not a blank
 * one, and a bare empty string would render as a file with nothing in it.
 */
export type GherkinPreview =
	| {
			readonly ok: true;
			readonly filename: string;
			readonly text: string;
			/** Questions the feature file cannot carry. Shown, not hidden. */
			readonly unwritable: number;
	  }
	| { readonly ok: false; readonly problems: readonly Problem[] };

type Pane = 'map' | 'gherkin';

/** What the copy button says it will copy. Named, so it is never "the text". */
function activeLabel(pane: Pane): string {
	return pane === 'map' ? 'example map' : 'feature file';
}

const TABS: readonly { readonly id: Pane; readonly label: string }[] = [
	{ id: 'map', label: 'Example map' },
	{ id: 'gherkin', label: 'Gherkin' },
];

export function PreviewDialog({
	open,
	filename,
	text,
	onApply,
	onGherkin,
	onClose,
}: {
	open: boolean;
	filename: string;
	text: string;
	onApply: (source: string) => ApplyResult;
	/** Called with the current draft, so the Gherkin tab tracks what is typed. */
	onGherkin: (source: string) => GherkinPreview;
	onClose: () => void;
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	const editor = useRef<HTMLTextAreaElement>(null);
	const tabRefs = useRef<Partial<Record<Pane, HTMLButtonElement | null>>>({});
	const [draft, setDraft] = useState(text);
	const [pane, setPane] = useState<Pane>('map');
	const [problems, setProblems] = useState<readonly Problem[]>([]);
	const [copied, setCopied] = useState<'idle' | 'done' | 'manual'>('idle');

	useEffect(() => {
		const element = dialog.current;
		if (!element) return;
		if (open && !element.open) element.showModal();
		if (!open && element.open) element.close();
	}, [open]);

	// Seed on open, and only on open. After that the draft is the visitor's.
	useEffect(() => {
		if (!open) return;
		setDraft(text);
		setPane('map');
		setProblems([]);
		setCopied('idle');
		// `text` is intentionally not a dependency: re-seeding mid-edit would
		// discard what somebody was typing.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	// Escape and the backdrop close it natively, without React knowing, so the
	// element's own close event is what state follows — not the other way round.
	useEffect(() => {
		const element = dialog.current;
		if (!element) return;
		const closed = () => onClose();
		element.addEventListener('close', closed);
		return () => element.removeEventListener('close', closed);
	}, [onClose]);

	const dirty = draft !== text;

	// Only while the Gherkin tab is showing: rendering a feature file for text
	// nobody is looking at would parse the draft on every keystroke.
	const gherkin = useMemo(
		() => (open && pane === 'gherkin' ? onGherkin(draft) : null),
		[open, pane, draft, onGherkin],
	);

	const shown = pane === 'map' ? draft : gherkin?.ok ? gherkin.text : '';
	const shownName = pane === 'map' ? filename : gherkin?.ok ? gherkin.filename : '—';

	const copy = async () => {
		const done = await copyText(shown);
		if (done) {
			setCopied('done');
			// Long enough to read, short enough that the button is not stuck
			// looking like a checkmark next time it is glanced at.
			setTimeout(() => setCopied('idle'), 2000);
			return;
		}
		// Nothing could write to the clipboard, so select the text and say so.
		// Telling somebody to press a key is a poor outcome; leaving them with a
		// button that silently did nothing is a worse one. The Gherkin pane has no
		// textarea to select, so the message stands on its own there.
		editor.current?.select();
		setCopied('manual');
	};

	const apply = () => {
		const found = onApply(draft);
		setProblems(found);
		// Nothing is closed and nothing is lost on a bad parse: the text stays
		// exactly as typed, with the line and column of each problem beside it.
		if (found.length === 0) onClose();
	};

	// No `display` utility on the <dialog> itself — not even `flex`.
	//
	// The browser hides a closed dialog with `dialog:not([open]) { display: none }`
	// from its *user-agent* stylesheet, and any author rule beats a UA rule
	// regardless of specificity. One `flex` class here therefore pins the dialog
	// open forever: it renders inline in the page flow, before it is ever opened
	// and after close() alike, with no backdrop and no way to dismiss it.
	//
	// global.css restates the UA rule as an author rule so a display utility
	// landing here again cannot resurrect the bug, but the right fix is still to
	// lay the contents out on an inner element, which is what the div below is.
	return (
		<dialog
			ref={dialog}
			aria-labelledby="preview-title"
			className="m-auto w-[min(56rem,92vw)] rounded-2xl border border-slate-200 bg-white p-0 text-ink backdrop:bg-black/50 dark:border-slate-700 dark:bg-night-raised dark:text-slate-100"
		>
			<div className="flex max-h-[85vh] flex-col">
				<div className="flex items-baseline justify-between gap-4 border-b border-slate-200 px-5 py-3 dark:border-slate-700">
					<div>
						<h2 id="preview-title" className="text-sm font-semibold">
							What this board would export
						</h2>
						<p className="mt-0.5 font-mono text-xs text-ink-muted dark:text-slate-400">{shownName}</p>
					</div>
					<div className="flex items-center gap-2">
						<IconButton
							icon={copied === 'done' ? 'check' : 'copy'}
							label={copied === 'done' ? 'Copied' : `Copy the ${activeLabel(pane)} to the clipboard`}
							onClick={copy}
							disabled={shown === ''}
						/>
						{/* Not rendered at all on the Gherkin tab, rather than disabled.
						    A greyed-out Apply says "not right now"; the truth is that a
						    feature file is never applicable, because nothing reads one
						    back. Absence states that better than a tooltip. */}
						{pane === 'map' && (
							<IconButton
								icon="apply"
								label="Apply this text to the board"
								tone="primary"
								disabled={!dirty}
								onClick={apply}
							/>
						)}
						<IconButton icon="close" label="Close preview" onClick={onClose} />
					</div>
				</div>

				{/*
				  A real tablist, with roving focus.
				
				  Arrow keys move between tabs and only the selected one is tabbable,
				  which is what the pattern requires — two plain buttons would put two
				  extra stops in a dialog whose Tab order matters, and would tell a
				  screen reader nothing about the panel below.
				*/}
				<div
					role="tablist"
					aria-label="Export formats"
					onKeyDown={(event) => {
						const at = TABS.findIndex((tab) => tab.id === pane);
						const to =
							event.key === 'ArrowRight' ? (at + 1) % TABS.length
							: event.key === 'ArrowLeft' ? (at - 1 + TABS.length) % TABS.length
							: event.key === 'Home' ? 0
							: event.key === 'End' ? TABS.length - 1
							: -1;
						if (to === -1) return;
						event.preventDefault();
						const next = TABS[to]!.id;
						setPane(next);
						tabRefs.current[next]?.focus();
					}}
					className="flex gap-1 border-b border-slate-200 px-5 dark:border-slate-700"
				>
					{TABS.map((tab) => (
						<button
							key={tab.id}
							ref={(element) => {
								tabRefs.current[tab.id] = element;
							}}
							type="button"
							role="tab"
							id={`preview-tab-${tab.id}`}
							aria-selected={pane === tab.id}
							aria-controls={`preview-pane-${tab.id}`}
							tabIndex={pane === tab.id ? 0 : -1}
							onClick={() => {
								setPane(tab.id);
								// The checkmark refers to whatever was last copied, so it
								// must not survive a move to a tab holding other text.
								setCopied('idle');
							}}
							className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand motion-reduce:transition-none ${
								pane === tab.id
									? 'border-brand text-brand dark:border-sky-400 dark:text-sky-400'
									: 'border-transparent text-ink-muted hover:text-ink dark:text-slate-400 dark:hover:text-slate-100'
							}`}
						>
							{tab.label}
						</button>
					))}
				</div>

				{/* Announced rather than merely shown: the button's own glyph changes,
				    but a change of glyph is not something a screen reader reports. */}
				<p aria-live="polite" className="sr-only">
					{copied === 'done' ? 'Copied to the clipboard.' : ''}
				</p>

				{copied === 'manual' && (
					<p className="border-b border-slate-200 bg-warning/10 px-5 py-2 text-xs dark:border-slate-700">
						This browser would not let the page write to the clipboard.
						{pane === 'map' ? ' The text is selected — press' : ' Select the text and press'}
						<kbd className="mx-1 rounded border border-slate-300 px-1 dark:border-slate-600">⌘C</kbd>
						or
						<kbd className="mx-1 rounded border border-slate-300 px-1 dark:border-slate-600">Ctrl+C</kbd>
						to copy it.
					</p>
				)}

				{pane === 'map' ? (
					<div
						role="tabpanel"
						id="preview-pane-map"
						aria-labelledby="preview-tab-map"
						className="flex min-h-0 flex-1 flex-col"
					>
						{problems.length > 0 && (
							<div className="px-5 pt-4">
								<ProblemList problems={problems} subject="This text" onDismiss={() => setProblems([])} />
							</div>
						)}

						<label className="sr-only" htmlFor="preview-editor">
							The example map as text. Edit it, then apply it to the board.
						</label>
						<textarea
							id="preview-editor"
							ref={editor}
							value={draft}
							onChange={(event) => setDraft(event.target.value)}
							spellCheck={false}
							// Tab moves focus rather than inserting a tab, which is the default
							// and is kept deliberately: trapping Tab in a textarea strands
							// keyboard users, and the format is whitespace-insensitive, so there
							// is nothing to indent with.
							className="min-h-[45vh] w-full flex-1 resize-none border-0 bg-transparent px-5 py-4 font-mono text-xs leading-relaxed focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
						/>
					</div>
				) : (
					<div
						role="tabpanel"
						id="preview-pane-gherkin"
						aria-labelledby="preview-tab-gherkin"
						// Focusable because it scrolls and cannot be typed into: a scrollable
						// region with nothing tabbable inside it is unreachable by keyboard.
						tabIndex={0}
						className="flex min-h-0 flex-1 flex-col overflow-auto focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand"
					>
						{gherkin?.ok === false && (
							<div className="px-5 pt-4">
								<ProblemList problems={gherkin.problems} subject="The text on the other tab" />
								<p className="mt-2 text-xs text-ink-muted dark:text-slate-400">
									There is no feature file to show while the map does not parse. Fix it on the
									Example map tab and this fills in.
								</p>
							</div>
						)}

						{gherkin?.ok && gherkin.unwritable > 0 && (
							<p className="border-b border-slate-200 bg-warning/10 px-5 py-2 text-xs dark:border-slate-700">
								{gherkin.unwritable === 1
									? '1 open question is not in this file.'
									: `${gherkin.unwritable} open questions are not in this file.`}{' '}
								An open question is not a specification, so Gherkin has no keyword for it. The
								<code className="mx-1">.examplemap</code> file keeps them.
							</p>
						)}

						{gherkin?.ok && (
							<pre className="min-h-[45vh] flex-1 px-5 py-4 font-mono text-xs leading-relaxed">
								{gherkin.text}
							</pre>
						)}
					</div>
				)}

				<div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-slate-200 px-5 py-3 text-xs text-ink-muted dark:border-slate-700 dark:text-slate-400">
					{pane === 'map' ? (
						<>
							<p>
								{dirty
									? 'Apply to put this text on the board, or close to discard it. Undo will bring the old board back.'
									: 'A render of the board, not a saved file. Nothing is written anywhere until you export.'}
							</p>
							{/* Stated up front, not after an edit that appears to have been
							    ignored — because it has been. */}
							<p>Every line here is editable. Applying replaces the board.</p>
						</>
					) : (
						<>
							<p>Written from the text on the other tab, not from the saved board.</p>
							<p>Read-only: this is what the map produced, and nothing reads a feature file back.</p>
						</>
					)}
				</div>
			</div>
		</dialog>
	);
}

/**
 * Put text on the clipboard, or report that it could not be done.
 *
 * The modern API needs a **secure context**, and doc-em is served over plain
 * HTTP through the cluster's ingress. Chrome and Firefox treat `*.localhost` as
 * trustworthy, so it works on a local cluster and would quietly stop working the
 * first time this is deployed somewhere real without TLS — which is exactly the
 * kind of failure that gets discovered by a person, in a workshop, with no way
 * to get their file out.
 *
 * Hence the `execCommand` fallback. It is deprecated and it is also the only
 * thing that works in that case.
 */
async function copyText(text: string): Promise<boolean> {
	try {
		if (window.isSecureContext && navigator.clipboard) {
			await navigator.clipboard.writeText(text);
			return true;
		}
	} catch {
		// Permission refused, or a browser that rejects a write it did not tie to
		// a gesture it recognises. Fall through rather than give up.
	}

	try {
		const scratch = document.createElement('textarea');
		scratch.value = text;
		// Off-screen rather than hidden: `display: none` cannot be selected, and
		// an element the viewport can see would scroll the page on focus.
		scratch.setAttribute('readonly', '');
		scratch.style.position = 'fixed';
		scratch.style.top = '-1000px';
		document.body.append(scratch);
		scratch.select();
		const done = document.execCommand('copy');
		scratch.remove();
		return done;
	} catch {
		return false;
	}
}
