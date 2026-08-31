/**
 * Where the key and the model live, in one panel.
 *
 * ba-ddd-mapper's `src/components/agent/Settings.tsx`, with this app's shell:
 * a native `<dialog>` rather than the mapper's hand-positioned div, for the
 * reasons `StoreState` gives — `showModal()` brings the focus trap, the inert
 * background, the Escape key and the top-layer stacking with it.
 *
 * **It is honest about the key.** A local-first tool that calls a paid API has
 * exactly one place to keep a credential, and it is not a safe one: anything
 * that can run script on this origin can read `localStorage`. Saying so is the
 * least this can do — and offering *this tab only* as the default is the rest,
 * because the person who has not thought about it should get the smaller
 * exposure rather than the more convenient one.
 */

import { useEffect, useRef, useState } from 'react';
import { EFFORTS } from '../../lib/agent/protocol.ts';
import {
	AGENT_DEFAULTS,
	loadAgentConfig,
	loadKey,
	saveAgentConfig,
	saveKey,
	type AgentConfig,
} from '../../lib/storage.ts';
import { IconButton } from '../board/IconButton.tsx';

const FIELD =
	'w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm placeholder:text-ink-muted focus:border-brand focus:outline-none dark:border-slate-600 dark:bg-night-raised dark:placeholder:text-slate-500';

/**
 * The models worth offering, and why this list is short.
 *
 * A free-text box would let somebody paste a model name that does not exist and
 * get a 404 four seconds later; a list of everything Anthropic publishes would
 * be a maintenance burden this component has no business carrying. These are
 * the three that make sense for reading a example map: the default, a cheaper one
 * for quick questions, and the cheapest for when the question is trivial.
 */
const MODELS: readonly { id: string; label: string; note: string }[] = [
	{ id: 'claude-opus-5', label: 'Opus 5', note: 'the default — best at the reading questions' },
	{ id: 'claude-sonnet-5', label: 'Sonnet 5', note: 'faster and cheaper; good for a quick look' },
	{ id: 'claude-haiku-4-5', label: 'Haiku 4.5', note: 'cheapest; for simple questions only' },
];

export function Settings({
	open,
	onClose,
	onSaved,
}: {
	open: boolean;
	onClose: () => void;
	onSaved: (config: AgentConfig, key: string) => void;
}) {
	const dialog = useRef<HTMLDialogElement>(null);
	const [config, setConfig] = useState<AgentConfig>(AGENT_DEFAULTS);
	const [key, setKey] = useState('');

	useEffect(() => {
		const element = dialog.current;
		if (!element) return;
		if (open && !element.open) element.showModal();
		if (!open && element.open) element.close();
	}, [open]);

	// Read fresh each time it opens, like the store panel: another tab may have
	// changed either since this page loaded.
	useEffect(() => {
		if (!open) return;
		setConfig(loadAgentConfig());
		setKey(loadKey());
	}, [open]);

	const commit = () => {
		const trimmed = key.trim();
		saveAgentConfig(config);
		saveKey(trimmed, config.remember);
		onSaved(config, trimmed);
		onClose();
	};

	return (
		<dialog
			ref={dialog}
			onClose={onClose}
			onCancel={onClose}
			aria-labelledby="agent-settings-title"
			className="mx-auto mt-6 mb-auto flex max-h-[calc(100dvh-3rem)] w-[min(34rem,92vw)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-0 text-ink shadow-xl backdrop:bg-slate-900/30 backdrop:backdrop-blur-[1px] dark:border-slate-700 dark:bg-night-raised dark:text-slate-100"
		>
			<div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
				<div>
					<p className="font-mono text-[10px] tracking-[0.14em] text-ink-muted uppercase dark:text-slate-400">
						assistant
					</p>
					<h2 id="agent-settings-title" className="font-semibold">
						Configuration
					</h2>
				</div>
				<IconButton icon="close" label="Close" onClick={onClose} />
			</div>

			<div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 text-sm">
				<section>
					<label htmlFor="agent-key" className="text-xs font-semibold">
						API key
					</label>
					<input
						id="agent-key"
						type="password"
						value={key}
						autoComplete="off"
						spellCheck={false}
						onChange={(event) => setKey(event.target.value)}
						placeholder="sk-ant-…"
						className={`${FIELD} mt-1 font-mono`}
					/>
					<p className="mt-1.5 text-xs text-ink-muted dark:text-slate-400">
						Yours, from console.anthropic.com. It is kept in this browser and sent with each
						request; this server uses it and stores nothing.
					</p>

					{/* The choice, and the sentence that makes it a choice rather than a
					    checkbox somebody clicks past. */}
					<div className="mt-2 flex items-start gap-2">
						<input
							id="agent-remember"
							type="checkbox"
							checked={config.remember}
							onChange={(event) => setConfig({ ...config, remember: event.target.checked })}
							className="mt-0.5"
						/>
						<label htmlFor="agent-remember" className="text-xs">
							Remember it in this browser
							<span className="block text-ink-muted dark:text-slate-400">
								{config.remember
									? 'Kept until you clear it — and readable by anything that can run script on this page.'
									: 'Off: kept for this tab only, and gone when you close it.'}
							</span>
						</label>
					</div>
				</section>

				<section>
					<p className="text-xs font-semibold">Model</p>
					<div className="mt-1 space-y-1">
						{MODELS.map((model) => (
							<label key={model.id} className="flex items-start gap-2 text-xs">
								<input
									type="radio"
									name="agent-model"
									checked={config.model === model.id}
									onChange={() => setConfig({ ...config, model: model.id })}
									className="mt-0.5"
								/>
								<span>
									<strong>{model.label}</strong>
									<span className="text-ink-muted dark:text-slate-400"> — {model.note}</span>
								</span>
							</label>
						))}
					</div>
				</section>

				<section>
					<p className="text-xs font-semibold">Effort</p>
					<div className="mt-1 flex flex-wrap gap-1">
						{EFFORTS.map((effort) => (
							<button
								key={effort}
								type="button"
								onClick={() => setConfig({ ...config, effort })}
								className={`rounded border px-2 py-0.5 text-xs ${
									config.effort === effort
										? 'border-brand bg-brand text-white'
										: 'border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800'
								}`}
							>
								{effort}
							</button>
						))}
					</div>
					<p className="mt-1.5 text-xs text-ink-muted dark:text-slate-400">
						How long it thinks before answering. Higher costs more and is worth it for
						“is this rule really one rule”; lower is fine for “what does this card mean”.
					</p>
				</section>

				<section>
					<label htmlFor="agent-guidance" className="text-xs font-semibold">
						Standing instructions
					</label>
					<textarea
						id="agent-guidance"
						value={config.guidance}
						rows={4}
						onChange={(event) => setConfig({ ...config, guidance: event.target.value })}
						placeholder="Anything you want said every time: your house terms, a language, conventions this shop keeps."
						className={`${FIELD} mt-1 resize-y leading-snug`}
					/>
					<p className="mt-1.5 text-xs text-ink-muted dark:text-slate-400">
						Appended to the guide, and last — so where they conflict, these win.
					</p>
				</section>
			</div>

			<div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-700">
				<button
					type="button"
					onClick={onClose}
					className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
				>
					Cancel
				</button>
				<button
					type="button"
					onClick={commit}
					className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-strong"
				>
					Save
				</button>
			</div>
		</dialog>
	);
}
