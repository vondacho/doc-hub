/**
 * Which registered product this map is about.
 *
 * Sits above the map's title, because it is the larger claim: an example map is
 * about a product first and is called something second.
 *
 * Copied from doc-sm unchanged apart from this paragraph. The three states below
 * are a property of reading a list off another service, not of story mapping, so
 * they are the same three here.
 *
 * ## Three states, not one
 *
 * A picker over a list fetched from another service has to answer what happens
 * when the list is not what you expected, and each answer here is different:
 *
 *   - **the list arrived** — a `<select>`. Each option carries the name *and* the
 *     shortname, so it can be found by either, which is what a native select's
 *     type-to-jump searches against.
 *   - **the list arrived but does not contain the map's product** — the option is
 *     synthesised and flagged. This is an ordinary state: the file may predate
 *     the registration, name a product from another environment, or be about
 *     something nobody has registered. Dropping the value on load would silently
 *     edit somebody's file, which is the one thing this component must not do.
 *   - **the registry could not be read** — a text box. The picker is gone, but
 *     the field is not: an existing value stays editable and exportable, and the
 *     reason is shown rather than an empty dropdown, which would read as "the
 *     registry has no products in it" — a much more alarming and quite different
 *     claim.
 */

import { useId, useState } from 'react';
import type { Product } from '../../lib/products.ts';

/** Sentinel for "not about a registered product", which is a real answer. */
const NONE = '';

export function ProductPicker({
	product,
	products,
	unavailable,
	registryUrl,
	onChange,
}: {
	product: string | null;
	products: readonly Product[];
	unavailable: string | null;
	registryUrl: string;
	onChange: (product: string | null) => void;
}) {
	const selectId = useId();
	const known = products.some((candidate) => candidate.shortname === product);

	if (unavailable !== null) {
		return (
			<FreeText
				id={selectId}
				product={product}
				onChange={onChange}
				note={
					<>
						{unavailable} Type the shortname if you know it, or{' '}
						<a className="font-semibold text-brand underline" href={registryUrl}>
							open the registry
						</a>
						.
					</>
				}
			/>
		);
	}

	return (
		<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
			<label htmlFor={selectId} className="text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase dark:text-slate-400">
				Product
			</label>
			<select
				id={selectId}
				value={product ?? NONE}
				onChange={(event) => onChange(event.target.value === NONE ? null : event.target.value)}
				className="rounded-lg border border-slate-300 bg-transparent px-2 py-1 text-sm focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-brand dark:border-slate-600"
			>
				<option value={NONE}>No product</option>
				{/* The map's own product, when the registry does not know it. Listed
				    first so it is visible rather than buried, and labelled so nobody
				    reads it as a normal entry. */}
				{product !== null && !known && (
					<option value={product}>{product} — not in the registry</option>
				)}
				{products.map((candidate) => (
					<option key={candidate.shortname} value={candidate.shortname}>
						{candidate.name} — {candidate.shortname}
					</option>
				))}
			</select>

			{product !== null && !known && (
				<span className="text-xs text-ink-muted dark:text-slate-400">
					This map names a product the registry does not have.{' '}
					<a className="font-semibold text-brand underline" href={registryUrl}>
						Register it
					</a>
					, or pick another.
				</span>
			)}
			{products.length === 0 && (
				<span className="text-xs text-ink-muted dark:text-slate-400">
					No products are registered yet.{' '}
					<a className="font-semibold text-brand underline" href={registryUrl}>
						Register one
					</a>
					.
				</span>
			)}
		</div>
	);
}

function FreeText({
	id,
	product,
	onChange,
	note,
}: {
	id: string;
	product: string | null;
	onChange: (product: string | null) => void;
	note: React.ReactNode;
}) {
	// Dispatches on blur, not per keystroke — the same rule the card editor
	// follows, and what keeps a change to one undo step.
	const [draft, setDraft] = useState(product ?? '');

	return (
		<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
			<label htmlFor={id} className="text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase dark:text-slate-400">
				Product
			</label>
			<input
				id={id}
				value={draft}
				placeholder="shortname"
				onChange={(event) => setDraft(event.target.value)}
				onBlur={() => onChange(draft.trim() === '' ? null : draft.trim())}
				onKeyDown={(event) => {
					if (event.key === 'Enter') event.currentTarget.blur();
				}}
				className="rounded-lg border border-slate-300 bg-transparent px-2 py-1 text-sm focus-visible:border-brand focus-visible:outline-2 focus-visible:outline-brand dark:border-slate-600"
			/>
			<span className="text-xs text-ink-muted dark:text-slate-400">{note}</span>
		</div>
	);
}
