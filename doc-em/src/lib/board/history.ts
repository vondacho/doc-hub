/**
 * Undo and redo, as a wrapper around any reducer.
 *
 * Generic from the start, because doc-em and doc-es want exactly this and
 * writing it generic costs nothing. Nothing in this file mentions a story map.
 *
 * ## Why undo is in v1
 *
 * doc-sm has no backend, no database and no autosave. Its whole failure mode is
 * "I dragged that somewhere and I cannot get it back, and there is no save to
 * fall back on." Undo is not a refinement here; it is the substitute for
 * persistence, and shipping without it would make the first bad drop
 * unrecoverable.
 *
 * ## Snapshots, not inverse actions
 *
 * The board state is persistent by construction — a reducer returns new objects
 * only for the arrays and records it touched — so a hundred snapshots of a
 * five-hundred-card board is a hundred small spines over shared leaves, not a
 * hundred copies. Inverse actions would be smaller still and would need every
 * action to be invertible, which is a correctness burden for a saving that does
 * not matter at this size.
 *
 * ## No coalescing
 *
 * There is deliberately no "merge this action with the previous one" machinery.
 * Inline title editing keeps its draft in component state and dispatches once,
 * on blur or Enter, so a rename is already one entry. That single decision
 * removes the whole class of "every keystroke is an undo step" plumbing.
 */

export interface History<T> {
	readonly past: readonly T[];
	readonly present: T;
	readonly future: readonly T[];
}

export type HistoryAction = { readonly type: 'undo' } | { readonly type: 'redo' };

export function initialHistory<T>(present: T): History<T> {
	return { past: [], present, future: [] };
}

export function canUndo<T>(history: History<T>): boolean {
	return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
	return history.future.length > 0;
}

export interface UndoableOptions<A> {
	/** How many steps back the stack goes before the oldest is dropped. */
	readonly limit: number;
	/**
	 * Actions that start a new document rather than change the current one.
	 * Importing a file clears the stack: undoing across an import back into a
	 * map the visitor has already replaced would be a surprise, not a rescue.
	 */
	readonly resets: (action: A) => boolean;
}

export function undoable<T, A>(
	reduce: (state: T, action: A) => T,
	options: UndoableOptions<A>,
): (history: History<T>, action: A | HistoryAction) => History<T> {
	return (history, action) => {
		if (isHistoryAction(action)) {
			if (action.type === 'undo') {
				const previous = history.past.at(-1);
				if (previous === undefined) return history;
				return {
					past: history.past.slice(0, -1),
					present: previous,
					future: [history.present, ...history.future],
				};
			}
			const next = history.future[0];
			if (next === undefined) return history;
			return {
				past: [...history.past, history.present],
				present: next,
				future: history.future.slice(1),
			};
		}

		const present = reduce(history.present, action);

		// An action that changed nothing must not consume an undo step. Reducers
		// here return the same object when they decline, which makes this an
		// identity check rather than a deep comparison.
		if (present === history.present) return history;

		if (options.resets(action)) return { past: [], present, future: [] };

		const past = [...history.past, history.present];
		return {
			past: past.length > options.limit ? past.slice(past.length - options.limit) : past,
			present,
			// Any new action abandons the redo branch. This is what every editor
			// does, and the alternative — a tree — is a feature nobody asked for.
			future: [],
		};
	};
}

function isHistoryAction<A>(action: A | HistoryAction): action is HistoryAction {
	const type = (action as { type?: unknown }).type;
	return type === 'undo' || type === 'redo';
}
