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
		role: "Solution architect",
		prompts: [
			"Group these events into clusters that share a language and change together, and propose the context boundaries they imply.",
			"Which events cross from one lane to another? For each crossing, say what the relationship between those two sides would have to be.",
			"Which terms on this wall are used by two lanes to mean different things? Those are boundaries, not vocabulary problems.",
			"Which external systems appear more than once, and in how many places would we be coupled to each?",
			"Read this wall as a set of candidate contexts. For each, say what it would own and what it would have to ask somebody else for.",
			"Which policies here span two lanes? A rule that reacts in one place and commands in another is an integration we have not designed yet.",
			"Which hotspots are really boundary disputes \u2014 two groups defending different models of the same thing?"
		],
	},
	{
		role: "Process manager",
		prompts: [
			"Walk this timeline end to end and name every handoff between lanes. For each, say what is waiting and on whom.",
			"Which stretch of this process has no actor and no system anywhere near it? That is work nobody has claimed.",
			"This wall documents the happy path. Name the five most likely exceptions and say where each would branch off.",
			"Which columns hold cards from three or more lanes? Say whether that is genuine concurrency or a queue we have drawn as simultaneity.",
			"Which policies here are really manual decisions somebody makes in a meeting? Say what would have to be true to automate each.",
			"Read this wall as a cycle time. Where would you look first for the delay, and what card is missing that would prove it?"
		],
	},
	{
		role: "Business analyst",
		prompts: [
			"Which events on this wall are commands wearing an event's colour? Rename them to what actually happened.",
			"Where is this timeline suspiciously free of hotspots? Name what the room probably agreed too quickly.",
			"Which policies have no event before them or no command after them? That is where a decision has no owner."
		],
	},
	{
		role: "UX leader",
		prompts: [
			"Where in this timeline does a person have to decide something with no read model in front of them?",
			"Which events would the customer never learn about? List the ones where silence is the experience.",
			"Which hotspots here are actually experience problems rather than system problems?"
		],
	},
	{
		role: "Product manager",
		prompts: [
			"Where in this timeline does the customer wait, and what event would tell them what is happening?",
			"Which part of this process would we still have to run by hand after everything on this wall is built?"
		],
	},
	{
		role: "Technical architect",
		prompts: [
			"Which aggregates does this wall imply, and which commands would each accept?"
		],
	},
	{
		role: "Test manager",
		prompts: [
			"Which hotspots on this wall would become defects if nobody resolved them before the build?"
		],
	},
];
