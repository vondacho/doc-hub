/**
 * The prompts this board is worth spending the assistant on, by role.
 *
 * The panel's empty state used to hard-code three examples. Three is enough to
 * show what a question looks like and far too few to answer "what should *I*
 * ask" — which depends entirely on whether you are planning a release, drawing a
 * boundary or deciding whether a rule can be tested.
 *
 * **They are grouped by role and they are clickable.** Clicking one fills the
 * box rather than sending it: every prompt here is a starting point somebody
 * should edit before asking, and one that sent itself would train the opposite
 * habit.
 *
 * Roles are ordered by how many prompts each has for this board, so the role
 * this board serves most leads the list.
 *
 * ## Where these come from, and the duplication
 *
 * ba-portal's `/doc/tooling/prompts/` is canonical: it carries the argument —
 * each role's scope, their daily challenge, and what the five techniques are
 * worth to them — and covers every board. This file is that page's prompts for
 * *this* board and nothing else.
 *
 * That is a deliberate duplication rather than one nobody noticed. ba-portal and
 * this app are separate deployments in separate repositories, and an import
 * across that seam would couple a board's build to a documentation site's.
 * Changing a prompt means changing it in both places; the panel links out to the
 * page so a reader can always reach the half that carries the reasoning.
 */

export interface PromptGroup {
	/** The role these are written for. */
	readonly role: string;
	readonly prompts: readonly string[];
}

export const PROMPTS: readonly PromptGroup[] = [
	{
		role: "Business analyst",
		prompts: [
			"Which rules here have no examples? For each, write the one example that would show whether we actually agree.",
			"Which of these examples restates its rule instead of illustrating it? Rewrite them with concrete values, dates and names.",
			"Turn every open question into the smallest decision somebody could make this week, and say who would have to make it.",
			"Which two rules here are really the same rule said twice?",
			"Which rules are policy the business chose, and which are constraints it is stuck with? Say which ones somebody could decide to change.",
			"Which rule here would a person in the business phrase differently? Rewrite each in the words they would use.",
			"What does this story assume about the domain that nobody has written down as a rule?"
		],
	},
	{
		role: "Test manager",
		prompts: [
			"Which of these examples is too vague to become a failing test? Say what value, date or name is missing from each.",
			"Which rules could never fail? A rule you cannot write a breaking example for is a description, not an acceptance criterion.",
			"For each rule, name the boundary case nobody has written \u2014 the one right at the edge.",
			"Which `then` clauses only say what did not happen? Add the one that says what did.",
			"List the open questions in order of how much test work each would invalidate if it were answered the other way.",
			"Which rules would need the same setup? Group them, and say what that shared setup tells us about the model."
		],
	},
	{
		role: "Product manager",
		prompts: [
			"Is this story ready to estimate? Count the open questions and say which one would change the size most.",
			"This story looks too big. Which rules would split it, and what would each half be worth shipping on its own?"
		],
	},
	{
		role: "UX leader",
		prompts: [
			"Rewrite these examples from the user's point of view \u2014 what they did and what they saw \u2014 rather than from the system's."
		],
	},
];
