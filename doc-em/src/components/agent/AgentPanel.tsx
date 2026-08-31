/**
 * The prompting area: a demand in, an answer beside the map.
 *
 * ba-ddd-mapper's `src/components/agent/AgentPanel.tsx`. Two things differ, and
 * both come from this app having one notation rather than two: nothing is
 * parameterised by language, and `check` is this board's parser rather than a
 * prop that could be either.
 *
 * **A proposal is never applied without being read, and never offered without
 * parsing.** The claim this whole tool rests on is that the text is the map;
 * handing over a document that does not parse would break it, and applying one
 * silently would make the visitor's file something they did not write. So the
 * answer streams as prose, the proposal is formatted, parsed, and shown as a
 * diff, and Apply is a button they press.
 *
 * It goes through the same path a typed edit takes, which means undo takes the
 * whole thing back in one gesture — the same guarantee dragging a card has.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { diffLines, hunks, tally, type Row } from '../../lib/diff.ts';
import { format } from '../../lib/format.ts';
import {
	LANGUAGE_LABEL,
	openFence,
	proposalIn,
	proseIn,
	type AgentEvent,
} from '../../lib/agent/protocol.ts';
import type { Problem } from '../../lib/examplemap/problems.ts';
import { loadAgentConfig, loadKey, type AgentConfig } from '../../lib/storage.ts';
import { PROMPTS, type PromptGroup } from '../../lib/agent/prompts.ts';
import { IconButton } from '../board/IconButton.tsx';
import { Settings } from './Settings.tsx';

interface Props {
	/** The document as it stands. Sent whole; the model needs all of it. */
	source: string;
	/**
	 * ba-portal's prompt page, resolved by the page and passed in.
	 *
	 * Not read from `links.ts` here, and that is not a style choice: those
	 * helpers read `process.env`, which does not exist in a client bundle.
	 * This component only ever runs in a browser.
	 */
	promptsUrl: string;
	/** The parser. Gates whether a proposal may be applied. */
	check: (text: string) => readonly Problem[];
	/**
	 * How much of the window the panel takes, as a percentage. Owned by the
	 * board, because the handle that changes it sits between the panes and
	 * belongs to the layout rather than to the panel.
	 */
	width: number;
	onApply: (next: string) => void;
	onClose: () => void;
}

interface Answer {
	readonly text: string;
	readonly thinking: string;
	readonly usage: { input: number; output: number; cached: number } | null;
	readonly error: string | null;
}

const EMPTY: Answer = { text: '', thinking: '', usage: null, error: null };

export function AgentPanel({ source, promptsUrl, check, width, onApply, onClose }: Props) {
	const [prompt, setPrompt] = useState('');
	const [answer, setAnswer] = useState<Answer>(EMPTY);
	const [asking, setAsking] = useState(false);
	const [showSettings, setShowSettings] = useState(false);
	const [config, setConfig] = useState<AgentConfig | null>(null);
	const [key, setKey] = useState('');
	/** What was asked, kept beside the answer so the panel reads as an exchange. */
	const [asked, setAsked] = useState('');
	const abort = useRef<AbortController | null>(null);
	/**
	 * Whether the prompt library is showing over the exchange.
	 *
	 * It shows on its own before the first question — there is nothing else
	 * to put there — and after that it is a thing you open. The header button
	 * exists because the second question is the one somebody has no idea how
	 * to phrase: the first was obvious enough to type.
	 */
	const [browsing, setBrowsing] = useState(false);
	const box = useRef<HTMLTextAreaElement>(null);
	const tail = useRef<HTMLDivElement>(null);

	useEffect(() => {
		setConfig(loadAgentConfig());
		setKey(loadKey());
	}, []);

	// Follow the stream, but only while the reader is already at the bottom —
	// yanking the view back down while somebody is re-reading the first
	// paragraph is the worst thing a streaming panel does.
	useEffect(() => {
		const box = tail.current;
		if (!box) return;
		const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
		if (atBottom) box.scrollTop = box.scrollHeight;
	}, [answer.text, answer.thinking]);

	useEffect(() => () => abort.current?.abort(), []);

	const ask = useCallback(async () => {
		const demand = prompt.trim();
		if (demand === '' || asking) return;
		if (!key) {
			setShowSettings(true);
			return;
		}

		const settings = config ?? loadAgentConfig();
		abort.current?.abort();
		const controller = new AbortController();
		abort.current = controller;

		setAsked(demand);
		setPrompt('');
		setAnswer(EMPTY);
		setAsking(true);

		try {
			const response = await fetch('/api/agent', {
				method: 'POST',
				signal: controller.signal,
				headers: { 'content-type': 'application/json', 'x-model-key': key },
				body: JSON.stringify({
					source,
					prompt: demand,
					model: settings.model,
					effort: settings.effort,
					guidance: settings.guidance,
				}),
			});

			// A refusal before the stream opens is plain JSON — see the route.
			if (!response.ok || !response.body) {
				const said = await response.json().catch(() => null);
				setAnswer((current) => ({
					...current,
					error:
						(said as { message?: string } | null)?.message ??
						`The request failed (${response.status}).`,
				}));
				return;
			}

			await read(response.body, (event) => {
				setAnswer((current) => {
					if (event.type === 'text') return { ...current, text: current.text + event.text };
					if (event.type === 'thinking') {
						return { ...current, thinking: current.thinking + event.text };
					}
					if (event.type === 'usage') {
						return {
							...current,
							usage: { input: event.input, output: event.output, cached: event.cached },
						};
					}
					return { ...current, error: event.message };
				});
			});
		} catch (error) {
			// An abort is the visitor pressing Stop, not a failure.
			if ((error as Error)?.name !== 'AbortError') {
				setAnswer((current) => ({ ...current, error: 'Lost the connection to this page\u2019s server.' }));
			}
		} finally {
			setAsking(false);
		}
	}, [asking, config, key, prompt, source]);

	/**
	 * Take a prompt from the library into the box — and stop there.
	 *
	 * Deliberately does not send. Every prompt in that list is a starting
	 * point somebody should name a lane, a rule or a delivery in before
	 * asking, and one that sent itself would teach the opposite habit.
	 */
	const pick = useCallback((text: string) => {
		setPrompt(text);
		setBrowsing(false);
		box.current?.focus();
	}, []);

	/**
	 * Whether the library is what the body is currently showing.
	 *
	 * Two reasons it can be, and the button has to report both. Before the first
	 * question there is nothing else to put there, so it shows without anybody
	 * asking; after that it shows because somebody pressed Prompts. A toggle that
	 * read only the second would sit there looking off while the list it controls
	 * was on screen — and pressing it would appear to do nothing, which is exactly
	 * what it did.
	 */
	const showingPrompts = browsing || (asked === '' && !asking);

	/*
	 * The proposal, checked before it is offered.
	 *
	 * Formatted first, so the diff is about meaning and not about where the
	 * model chose to put its spaces — the formatter is a no-op on a
	 * well-written document and fixes the indentation of one that is not.
	 */
	const raw = asking ? null : proposalIn(answer.text);
	const proposal = raw === null ? null : (format(raw) ?? raw);
	const problems = proposal === null ? [] : check(proposal);
	const rows: readonly Row[] = proposal === null ? [] : diffLines(source, proposal);
	const counted = tally(rows);
	const prose = proseIn(answer.text);

	return (
		<section
			aria-label="Assistant"
			className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-slate-300 lg:flex-[0_0_var(--agent-width)] dark:border-slate-700"
			/* A basis and no grow, so the board beside it takes the rest and
			   dragging the handle moves this edge and nothing else. Only once the
			   panes are side by side: stacked there is no handle to drag, and a
			   share of the *height* is not what the number means. The width goes
			   through a custom property because that is the only way a dragged
			   number reaches a class with a breakpoint on it. */
			style={{ ['--agent-width' as string]: `${width}%` }}
		>
			<div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-700">
				<strong className="text-sm">Assistant</strong>
				<span className="text-xs text-ink-muted dark:text-slate-400">
					reading this {LANGUAGE_LABEL}
				</span>
				<span className="ml-auto flex items-center gap-1">
					<button
						type="button"
						onClick={() => setBrowsing((was) => !was)}
						aria-pressed={showingPrompts}
						className={`rounded px-2 py-0.5 text-xs ${
							showingPrompts
								? 'bg-brand text-white'
								: 'hover:bg-slate-100 dark:hover:bg-slate-800'
						}`}
					>
						Prompts
					</button>
					<button
						type="button"
						onClick={() => setShowSettings(true)}
						className="rounded px-2 py-0.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
					>
						Settings
					</button>
					<IconButton icon="close" label="Close the assistant" size="sm" onClick={onClose} />
				</span>
			</div>

			<div ref={tail} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-sm">
				{showingPrompts ? (
					<Blank
						hasKey={key !== ''}
						onSettings={() => setShowSettings(true)}
						onPick={pick}
						promptsUrl={promptsUrl}
					/>
				) : (
					<>
						<p className="mb-3 rounded-md bg-slate-100 px-2.5 py-1.5 text-xs whitespace-pre-wrap dark:bg-slate-800">
							{asked}
						</p>

						{/* The reasoning, while there is nothing else to show. Not kept:
						    it is the model working, not its answer. */}
						{answer.thinking !== '' && prose === '' && (
							<p className="mb-2 text-xs whitespace-pre-wrap text-ink-muted italic dark:text-slate-500">
								{answer.thinking.slice(-400)}
							</p>
						)}

						{prose !== '' && <div className="whitespace-pre-wrap">{prose}</div>}

						{asking && openFence(answer.text) && (
							<p className="mt-2 text-xs text-ink-muted dark:text-slate-400">Writing a proposal…</p>
						)}

						{asking && prose === '' && answer.thinking === '' && (
							<p className="text-xs text-ink-muted dark:text-slate-400">Thinking…</p>
						)}

						{answer.error && (
							<p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
								{answer.error}
							</p>
						)}

						{proposal !== null && (
							<Proposal
								rows={rows}
								counted={counted}
								problems={problems}
								onApply={() => onApply(proposal)}
							/>
						)}

						{answer.usage && (
							<p className="mt-3 text-[11px] text-ink-muted dark:text-slate-500">
								{answer.usage.input.toLocaleString()} in · {answer.usage.output.toLocaleString()} out
								{answer.usage.cached > 0 && ` · ${answer.usage.cached.toLocaleString()} from cache`}
							</p>
						)}
					</>
				)}
			</div>

			<div className="border-t border-slate-200 p-2 dark:border-slate-700">
				<textarea
					ref={box}
					value={prompt}
					rows={3}
					onChange={(event) => setPrompt(event.target.value)}
					onKeyDown={(event) => {
						// ⌘/ctrl + Enter sends; Enter is a newline, because a demand is a
						// paragraph and often two.
						if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
							event.preventDefault();
							void ask();
						}
					}}
					placeholder={`Ask about this example map, or ask for a change. ⌘/ctrl + ⏎`}
					className="w-full resize-y rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm leading-snug placeholder:text-ink-muted focus:border-brand focus:outline-none dark:border-slate-600 dark:bg-night-raised dark:placeholder:text-slate-500"
				/>
				<div className="mt-1 flex items-center gap-2">
					{asking ? (
						<button
							type="button"
							onClick={() => abort.current?.abort()}
							className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
						>
							Stop
						</button>
					) : (
						<button
							type="button"
							onClick={() => void ask()}
							disabled={prompt.trim() === ''}
							className="rounded-md bg-brand px-3 py-1 text-xs font-semibold text-white hover:bg-brand-strong disabled:opacity-40"
						>
							Ask
						</button>
					)}
					<span className="text-[11px] text-ink-muted dark:text-slate-500">
						The whole document goes with the question.
					</span>
				</div>
			</div>

			<Settings
				open={showSettings}
				onClose={() => setShowSettings(false)}
				onSaved={(next, savedKey) => {
					setConfig(next);
					setKey(savedKey);
				}}
			/>
		</section>
	);
}

/** Read the SSE body, one `data:` line at a time. */
async function read(
	body: ReadableStream<Uint8Array>,
	onEvent: (event: AgentEvent) => void,
): Promise<void> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });

		// A frame ends at a blank line, and a chunk may hold none, one, or six.
		const frames = buffer.split('\n\n');
		buffer = frames.pop() ?? '';
		for (const frame of frames) {
			const line = frame.trim();
			if (!line.startsWith('data:')) continue;
			try {
				onEvent(JSON.parse(line.slice(5).trim()) as AgentEvent);
			} catch {
				// A frame that is not JSON is not worth breaking the stream over.
			}
		}
	}
}

/**
 * What a proposal looks like before it is accepted.
 *
 * The diff first, because that is what has to be read; the button after it,
 * because a button above a diff gets pressed before the diff does.
 */
function Proposal({
	rows,
	counted,
	problems,
	onApply,
}: {
	rows: readonly Row[];
	counted: { added: number; removed: number };
	problems: readonly Problem[];
	onApply: () => void;
}) {
	const shown = hunks(rows);

	if (problems.length > 0) {
		return (
			<div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
				<p className="font-semibold">The proposed document does not parse, so it is not offered.</p>
				<ul className="mt-1 space-y-0.5">
					{problems.slice(0, 4).map((problem) => (
						<li key={`${problem.line}:${problem.message}`}>
							line {problem.line}: {problem.message}
						</li>
					))}
				</ul>
				<p className="mt-1.5">Say what was wrong and ask again — it can usually fix it.</p>
			</div>
		);
	}

	if (counted.added === 0 && counted.removed === 0) {
		return (
			<p className="mt-3 text-xs text-ink-muted dark:text-slate-400">
				The proposed document is identical to the one you have.
			</p>
		);
	}

	return (
		<div className="mt-3 overflow-hidden rounded-md border border-slate-300 dark:border-slate-700">
			<div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-slate-700 dark:bg-night-raised">
				<span className="font-semibold">Proposed</span>
				<span className="text-ink-muted dark:text-slate-400">
					+{counted.added} −{counted.removed}
				</span>
				<button
					type="button"
					onClick={onApply}
					title="Replace the document. Undo takes it back."
					className="ml-auto rounded bg-brand px-2 py-0.5 text-xs font-semibold text-white hover:bg-brand-strong"
				>
					Apply
				</button>
			</div>
			<div className="max-h-72 overflow-auto font-mono text-[11px] leading-[1.5]">
				{shown.map((row, index) =>
					row === null ? (
						<div
							key={`gap:${index}`}
							className="border-y border-slate-200 bg-slate-50 px-2 py-0.5 text-center text-ink-muted dark:border-slate-700 dark:bg-night-raised dark:text-slate-500"
						>
							⋯
						</div>
					) : (
						<div
							key={`${index}:${row.text}`}
							className={`px-2 whitespace-pre ${
								row.kind === 'added'
									? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200'
									: row.kind === 'removed'
										? 'bg-rose-50 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200'
										: 'text-ink-muted dark:text-slate-400'
							}`}
						>
							{row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ' '} {row.text}
						</div>
					),
				)}
			</div>
		</div>
	);
}

/**
 * The empty state: the prompt library, with a notice above it when there is no
 * key yet.
 *
 * The library is not decoration and it is not "ask me anything". Somebody
 * meeting this panel has no idea what it is for, and the honest answer is that
 * it depends who they are — a test manager and a solution architect open the
 * same board with different questions. So the prompts are grouped by role, and
 * clicking one puts it in the box to be edited rather than sending it.
 *
 * The full set, with the reasoning for each role, is on ba-portal; this is that
 * page's prompts for this board. See `src/lib/agent/prompts.ts` on why the two
 * are allowed to be separate copies.
 */
function Blank({
	hasKey,
	onSettings,
	onPick,
	promptsUrl,
}: {
	hasKey: boolean;
	onSettings: () => void;
	onPick: (text: string) => void;
	promptsUrl: string;
}) {
	return (
		<div className="text-xs">
			{/*
			 * The notice, and then the prompts anyway.
			 *
			 * This used to return early without a key, which made the Prompts
			 * button do nothing at all for the one person it most needed to work
			 * for. Somebody with no key is exactly who the list is written for:
			 * reading what the assistant is good at is how they decide whether to
			 * go and get one, and hiding it until they have one is backwards.
			 *
			 * Picking a prompt still works with no key. It fills the box, and Ask
			 * opens the settings panel — which is a better moment to ask for a
			 * credential than an empty screen was.
			 */}
			{hasKey ? (
				<p className="text-ink-muted dark:text-slate-400">
					The whole document goes with whatever you ask. Questions come back as prose; ask for a
					change and you get a document to review before it replaces yours.
				</p>
			) : (
				<div className="rounded-md border border-slate-300 px-2.5 py-2 dark:border-slate-700">
					<p className="text-ink-muted dark:text-slate-400">
						No API key yet — these are what it would be for. A key stays in this browser and is
						sent with each request; nothing is kept on the server.
					</p>
					<button
						type="button"
						onClick={onSettings}
						className="mt-2 rounded-md bg-brand px-3 py-1 text-xs font-semibold text-white hover:bg-brand-strong"
					>
						Add a key
					</button>
				</div>
			)}

			{PROMPTS.map((group: PromptGroup) => (
				<section key={group.role} className="mt-4">
					<h3 className="font-mono text-[10px] tracking-[0.14em] text-ink-muted uppercase dark:text-slate-400">
						{group.role}
					</h3>
					<ul className="mt-1 flex flex-col gap-0.5">
						{group.prompts.map((prompt) => (
							<li key={prompt}>
								{/* A button, not a link: it fills the box below rather than
								    going anywhere. */}
								<button
									type="button"
									onClick={() => onPick(prompt)}
									className="w-full rounded-md px-2 py-1 text-left text-xs leading-snug hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand dark:hover:bg-slate-800"
								>
									{prompt}
								</button>
							</li>
						))}
					</ul>
				</section>
			))}

			<p className="mt-5 border-t border-slate-200 pt-3 text-[11px] text-ink-muted dark:border-slate-700 dark:text-slate-500">
				These are this board's.{' '}
				<a
					href={promptsUrl}
					target="_blank"
					rel="noopener"
					className="font-semibold text-brand hover:underline"
				>
					The full set, by role, across every board
				</a>{' '}
				— with what each technique is worth to whom.
			</p>
		</div>
	);
}
