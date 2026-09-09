/**
 * The notation and the doctrine, written out for a session that is not here.
 *
 * Two Markdown files, and neither is about any particular map. Everything else
 * the export dialog offers is a rendering of the map on screen; these two are
 * the *reference* — what an `.examplemap` file is, and what a good example map
 * does — addressed to a model that has never seen doc-em.
 *
 * ## Why the tool ships its own instructions
 *
 * Because the alternative is what people do instead, which is paste half of a
 * remembered grammar into a prompt. A map lives in the repository of the
 * product it describes; the work of changing one therefore happens wherever
 * that repository is checked out, which is very often a terminal with an agent
 * in it and no doc-em anywhere near. That session has to know the notation
 * exactly — a ticket on a rule, or a `~status` it invented, produces a file
 * that will not open or a file that lies — and it has to know the doctrine, or
 * it will helpfully answer the red cards, which are the output of the session.
 *
 * ## Nothing here is written twice
 *
 * The body of both documents is `GRAMMAR`, `TAGS`, `EBNF`, `DOCTRINE` and
 * `EDITING` from src/lib/agent/guide.ts, verbatim. This module contributes the
 * framing —
 * who the reader is, what they are being asked to do, where to read more, and
 * where the file came from — and not one sentence of the content.
 *
 * ## No date, no board, no version
 *
 * These files are constant: the same map, a different map or no map at all
 * produces the same bytes. So they are named for what they are rather than for
 * the map that happened to be open — see `stem` in the export catalogue — and
 * they carry no timestamp, so a repository holding one shows a diff only when
 * the notation itself has moved.
 */

import { DOCTRINE, EBNF, EDITING, GRAMMAR, TAGS } from '../agent/guide.ts';

/**
 * What the two files are called, defined here rather than in the catalogue.
 *
 * Because each document names the other. "See the doctrine document beside this
 * one" is a useless sentence in a downloads folder — the reader has to guess
 * which file that is — and a filename written out by hand in the prose would be
 * a second copy of a string the export catalogue also holds. One constant, used
 * by the document that mentions it and by the destination that writes it, so
 * the cross-reference cannot come out pointing at nothing.
 */
export const NOTATION_STEM = 'examplemap-notation';
export const DOCTRINE_STEM = 'examplemap-doctrine';

/**
 * Where a file says what it is and how it can be wrong.
 *
 * Every instruction document an agent is handed should answer "who wrote this
 * and can I trust it", because the failure mode of a stale one is silent: it
 * reads exactly as authoritative as a current one. Saying plainly that the file
 * does not update itself is the part people forget to write.
 *
 * `extra` is where the notation document adds the sentence that only makes
 * sense there — which module defines the grammar, and who wins when the file
 * and the parser disagree. The doctrine has no parser to be overruled by.
 */
function provenance(extra: string | null): string {
	return `---

*Exported from doc-em, the example-mapping board these come from. It is a
snapshot of what that tool's own assistant is told, it does not update itself,
and nothing in it was generated from the map that happened to be
open.${extra === null ? '' : ` ${extra}`}*`;
}

/**
 * The notation, as instructions.
 *
 * The editing rules are here rather than in the doctrine, because they are
 * about the *file*: whose it is, what may be reformatted, and which fields
 * belong to a system this tool does not own. Somebody handed only this document
 * is the person about to change a map, and those rules are the difference
 * between a diff a reviewer reads and a diff that has answered four questions
 * nobody asked it to.
 */
export function notationDocument(): string {
	return `${[
		'# Working with `.examplemap` files',
		`You are being asked to read, write or change an example map — the record of
a Three Amigos conversation, kept as text, in a small declarative notation
called \`.examplemap\`. This document is the whole of that notation. Follow it
exactly: a file that does not parse cannot be opened by the tools the map is
kept for.`,
		GRAMMAR,
		/*
		 * Prose first, production set second, and never the other way round.
		 *
		 * Somebody who reads the formal grammar first learns what a file may
		 * contain and nothing about what any of it means — the difference between
		 * a `rule` and an `example` is four words in a production and the entire
		 * technique in the worked example above.
		 */
		EBNF,
		/*
		 * Conventions after both statements of the syntax, not between them.
		 *
		 * What a tag may look like is a grammar question and is answered twice
		 * above; which tags to write is not a grammar question at all, and
		 * putting it between the prose and the production set would split the two
		 * halves of one subject with a different subject.
		 */
		TAGS,
		`## Changing somebody's map

A map is the record of a conversation a room had, and you are editing it in
their absence. Every rule below follows from that.

${EDITING}

Read \`${DOCTRINE_STEM}.md\` before adding or rewriting cards. This notation will
happily let you write a map that parses perfectly and discovers nothing.`,
		provenance(
			'The grammar itself is defined by `src/lib/examplemap/` in doc-em: where a map and these rules disagree, the parser is right and this file is old.',
		),
	].join('\n\n')}\n`;
}

/**
 * The doctrine, as instructions.
 *
 * The session shape and the Gherkin note are not in the prompt this borrows
 * from, and that asymmetry is deliberate rather than an omission. The assistant
 * in the panel is always looking at a map that already exists and never writes
 * the feature file; a session reading this file may be asked to run the
 * conversation, or to take the map the rest of the way into executable
 * scenarios, and neither makes sense without them.
 */
export function doctrineDocument(): string {
	return `${[
		'# Reading an example map',
		`Example mapping is Matt Wynne's, introduced in
[Introducing Example Mapping](https://cucumber.io/blog/bdd/example-mapping-introduction/)
(Cucumber, 2015). It is a short conversation — the Three Amigos, around
twenty-five minutes for a well-understood story — in which a team takes one
user story and breaks it into four kinds of card:

- **yellow**, the story;
- **blue**, the rules that have to hold;
- **green**, concrete examples that illustrate a rule;
- **red**, the questions nobody in the room could answer.

You are almost certainly talking to somebody who was in that conversation and
knows the domain far better than you do. **Assume the facts on the map are
true.** What you have to offer is the reading: whether the examples are
concrete, whether the rules could actually fail, and whether the map is honest
about what nobody settled.`,
		`## How the session runs

1. **Name the story.** One yellow card. If naming it is hard, that is the first
   finding.
2. **Write the rules.** Blue cards: the constraints and acceptance criteria that
   have to hold for the story to be done.
3. **Illustrate each rule.** Green cards, one concrete case each — real numbers,
   real dates, real names. This is where disagreement surfaces, because two
   people who agree on a rule often disagree on an example of it.
4. **Capture what nobody can answer.** Red cards, the moment they come up. A
   question written down is an unknown unknown turned into a known one, which is
   the measurable progress the session makes.

Then the room votes on whether the story is ready. **The vote is the output, not
the cards** — and a "no" after twenty-five minutes is a good outcome, because it
cost twenty-five minutes instead of a sprint.`,
		DOCTRINE,
		`## What not to do

**Do not answer the red cards.** They are the output of the session. A plausible
answer written into one destroys the record that the room could not agree, and
the answer is not yours to give: a question is closed by the people who own the
domain. Say what you think in prose and leave the card where it is.

**Do not invent examples to make a rule look covered.** A green card is a case
somebody in the room recognised. One assembled from the rule's own words —
"expired vouchers are refused" under a rule that says expired vouchers are
refused — is the rule again, and it makes an unexamined rule look examined.

**Do not turn a question into a tag.** A tag labels something the room has said.
A red card is something the room could not answer, and turning the second into
the first is how a map stops being useful.

**Do not write Gherkin during the conversation.** The session is low-tech on
purpose — index cards, one line each — and reaching for formal syntax while the
room is still discovering is how the discovery stops. The \`.examplemap\` file is
where the conversation is recorded; the feature file is generated from it
afterwards.`,
		`## Where this becomes a feature file

An example's \`given\` / \`when\` / \`then\` lines are Gherkin steps, and doc-em
writes the \`.feature\` file from them: one \`Feature\` from the story, one
\`Scenario\` per example, and \`And\` generated wherever a clause repeats.

Two things do not survive that trip, and both matter.

**The questions have no Gherkin.** An open question is not a specification, so
the feature file is quietly missing every red card on the map. That is not a
bug in the generator — it is the reason the map is the document and the feature
file is an output of it.

**The rules become comments at best.** What a runner executes is the examples.
A rule with no examples under it contributes nothing to the feature file, which
is the same finding the doctrine names first, arriving a second time.

So: the \`.examplemap\` is the artefact to keep under version control. The
\`.feature\` is regenerated.`,
		`## Where this is described properly

- **[Introducing Example Mapping](https://cucumber.io/blog/bdd/example-mapping-introduction/)**
  — Matt Wynne's own article, and the source. The four colours, the timebox, the
  thumb vote, and the argument for index cards over syntax. Read it before
  facilitating a session.
- **[Cucumber's BDD documentation](https://cucumber.io/docs/bdd/)** — where
  example mapping sits in the wider practice: discovery, formulation,
  automation, in that order.

Neither this document nor the notation beside it is a facilitation guide — they
are what a model needs in order to be useful to somebody who has already been in
the room.`,
		provenance(`The notation a map is written in is in \`${NOTATION_STEM}.md\`.`),
	].join('\n\n')}\n`;
}
