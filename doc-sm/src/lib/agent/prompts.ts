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
		role: "Product manager",
		prompts: [
			"Which activities does the first delivery leave empty? Tell me what a user could not finish if we shipped only what is scheduled.",
			"Read this map as a plan rather than a backlog. If I have to cut a third of it, which stories go and what stops working?",
			"Which \"so that\" clauses fail to justify their story? List them with what is missing.",
			"Which steps carry so many stories that the step is really two, and where would you cut them?",
			"Which unscheduled stories are the ones this plan is quietly depending on?"
		],
	},
	{
		role: "UX leader",
		prompts: [
			"Read this backbone as a user journey. Where does it stop being a narrative and start being a list of features?",
			"Which stories name a persona their own activity does not list? Say whether the story is in the wrong place or the activity has not admitted who it is for.",
			"Which activity is doing work for every persona at once? That is usually two journeys drawn as one.",
			"If a new user met this product at the first activity and stopped at the end of the first delivery, what would they have failed to do?"
		],
	},
	{
		role: "Test manager",
		prompts: [
			"Which steps have stories in the first delivery but nothing that tests the step's own outcome?"
		],
	},
];
