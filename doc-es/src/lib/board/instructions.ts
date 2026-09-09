/**
 * The notation and the doctrine, written out for a session that is not here.
 *
 * Two Markdown files, and neither is about any particular wall. Everything else
 * the export dialog offers is a rendering of the storm on screen; these two are
 * the *reference* — what an `.eventstorm` file is, and what a good event storm
 * does — addressed to a model that has never seen doc-es.
 *
 * ## Why the tool ships its own instructions
 *
 * Because the alternative is what people do instead, which is paste half of a
 * remembered grammar into a prompt. A storm lives in the repository of the
 * product it describes; the work of changing one therefore happens wherever
 * that repository is checked out, which is very often a terminal with an agent
 * in it and no doc-es anywhere near. That session has to know the notation
 * exactly — a guessed `level` line or an invented `@` syntax produces a file
 * that will not open — and it has to know the doctrine, or it will helpfully
 * resolve the hotspots, which are the most valuable cards on the wall.
 *
 * Handing it the same text this tool's own assistant is given is the only
 * version of that which stays true. Which is the second point:
 *
 * ## Nothing here is written twice
 *
 * The body of both documents is `GRAMMAR`, `TAGS`, `EBNF`, `DOCTRINE` and
 * `EDITING` from src/lib/agent/guide.ts, verbatim. This module contributes the framing — who
 * the reader is, what they are being asked to do, where to read more, and where
 * the file came from — and not one sentence of the content.
 *
 * That is not tidiness. `doc/es-grammar.md` and `doc/eventstorming.md` are the
 * cautionary example sitting in this very repository: they are a second
 * statement of the same two subjects, they were not updated when the `level`
 * line was removed from the grammar, and they now document a syntax the parser
 * refuses. A file exported from here and pasted into somebody's agent would
 * carry that error into their repository. The prompt cannot drift the same way,
 * because it is what the shipped assistant is judged on.
 *
 * ## No date, no board, no version
 *
 * These files are constant: the same wall, a different wall or no wall at all
 * produces the same bytes. So they are named for what they are rather than for
 * the storm that happened to be open — see `stem` in the export catalogue —
 * and they carry no timestamp, so that a repository holding one shows a diff
 * only when the notation itself has moved.
 */

import { DOCTRINE, EBNF, EDITING, GRAMMAR, TAGS } from '../agent/guide.ts';

/**
 * What the two files are called, defined here rather than in the catalogue.
 *
 * Because each document names the other. "See the doctrine document beside
 * this one" is a useless sentence in a downloads folder — the reader has to
 * guess which file that is — and a filename written out by hand in the prose
 * would be a second copy of a string the export catalogue also holds. One
 * constant, used by the document that mentions it and by the destination that
 * writes it, so the cross-reference cannot come out pointing at nothing.
 */
export const NOTATION_STEM = 'eventstorm-notation';
export const DOCTRINE_STEM = 'eventstorm-doctrine';

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
 * and the parser disagree. The doctrine has no parser to be overruled by, and a
 * footer telling its reader to check their storm against a grammar it does not
 * contain would send them looking for something that is not in the file.
 */
function provenance(extra: string | null): string {
	return `---

*Exported from doc-es, the event-storming board these come from. It is a
snapshot of what that tool's own assistant is told, it does not update itself,
and nothing in it was generated from the storm that happened to be
open.${extra === null ? '' : ` ${extra}`}*`;
}

/**
 * The notation, as instructions.
 *
 * The editing rules are here rather than in the doctrine, because they are
 * about the *file*: whose it is, what may be reformatted, what a column means.
 * Somebody who has been handed only this document is the person about to change
 * a storm, and those rules are the difference between a diff a reviewer reads
 * and a diff that has rewritten every line.
 */
export function notationDocument(): string {
	return `${[
		'# Working with `.eventstorm` files',
		`You are being asked to read, write or change an event storm — a workshop
wall kept as text, in a small declarative notation called \`.eventstorm\`. This
document is the whole of that notation. Follow it exactly: a file that does not
parse cannot be opened by the tools the storm is kept for.`,
		GRAMMAR,
		/*
		 * Prose first, production set second, and never the other way round.
		 *
		 * Somebody who reads the formal grammar first learns what a file may
		 * contain and nothing about what any of it means — `Kind` is eleven
		 * alternatives in a list, and which one a card should be is the entire
		 * question. The worked example above answers that; this settles the
		 * cases the example does not happen to show.
		 */
		EBNF,
		/*
		 * Conventions after both statements of the syntax, not between them.
		 *
		 * What a tag may look like is a grammar question and is answered twice
		 * above; which tags to write is not a grammar question at all, and
		 * putting it between the prose and the production set would split the
		 * two halves of one subject with a different subject.
		 */
		TAGS,
		`## Changing somebody's storm

A storm is a document a room wrote together, and you are editing it in their
absence. Every rule below follows from that.

${EDITING}

Read \`${DOCTRINE_STEM}.md\` before adding or re-typing cards. This notation will
happily let you write a wall that parses perfectly and says nothing true.`,
		provenance(
			'The grammar itself is defined by `src/lib/eventstorm/` in doc-es: where a storm and these rules disagree, the parser is right and this file is old.',
		),
	].join('\n\n')}\n`;
}

/**
 * The doctrine, as instructions.
 *
 * The phases are not in the prompt this borrows from, and that asymmetry is
 * deliberate rather than an omission. The assistant in the panel is always
 * looking at a wall that already exists; a session reading this file may be
 * asked to transcribe one off photographs, or to help plan the workshop that
 * produces it, and neither of those makes sense without knowing what order the
 * room does things in.
 *
 * They are also the one part of a facilitation guide worth carrying: everything
 * else about running the workshop is about a room, and a model is not in it.
 */
export function doctrineDocument(): string {
	return `${[
		'# Reading an event storm',
		`Event storming is Alberto Brandolini's, described in *Introducing
EventStorming* and at [eventstorming.com](https://www.eventstorming.com/). It is
a workshop: domain experts, developers and the product owner build a shared
picture of a domain by writing down everything that *happens*, in the past
tense, in the business's own words, in time order, on a wall long enough to make
everyone uncomfortable.

You are almost certainly talking to somebody who was in that room and knows the
domain far better than you do. **Assume the facts on the wall are true.** What
you have to offer is the reading: whether the timeline holds together, whether
the cards are the kind they claim to be, and whether the wall is honest about
what nobody has settled.`,
		`## How the workshop runs

Four phases, in this order. Which one a wall is in decides what is missing on
purpose — a big picture with no commands on it is not unfinished, and pointing
that out is noise.

1. **Chaotic exploration.** Everyone writes domain events and puts them up. No
   discussion yet, no order yet. The mess is the point: it shows where the
   disagreement is.
2. **Enforce the timeline.** Order them left to right. Duplicates collapse,
   contradictions surface, and somebody says "that never happens" about a note
   another department wrote.
3. **Add the causes.** The commands that trigger events, the actors who issue
   them, the policies that react to them, the external systems involved.
4. **Find the seams.** Where does one model's language stop and the next begin?
   This is the output the architecture uses — the \`context\` note below says
   what makes a cluster a candidate.`,
		DOCTRINE,
		`## What not to do

**Do not resolve the hotspots.** They are the most valuable cards on the wall,
and a plausible answer written into one destroys the record that the room could
not agree. Ask about a hotspot, propose what would settle it, name who would
have to decide — but leave the card red.

**Do not invent domain facts.** A wall is what a room said. If the timeline has
a hole, say that it has a hole; a guess written in the business's own words is
indistinguishable from something somebody actually reported.

**Do not tidy the disagreement into a tag.** A tag labels something the room has
said. A hotspot is something the room could not settle. Turning the second into
the first is how a wall stops being honest.`,
		`## Where this is described properly

- **[eventstorming.com](https://www.eventstorming.com/)** — Alberto Brandolini's
  own site: the definition of the format, the note colours, the three workshop
  variants, and the book, *Introducing EventStorming*. This is the source, and
  where a disagreement between anything else and it should be settled.
- **[Event Storming — The Complete Guide](https://www.qlerify.com/post/event-storming-the-complete-guide)**
  — the most useful long-form walkthrough of the three levels: which colour is
  introduced at which level, the \`event → policy → command → system → event\`
  chain drawn out, and the facilitation detail almost nobody else writes down —
  how long chaotic exploration runs, how much wall it needs, how many people
  should be in the room, and what to do when the timeline will not order itself.
  It is published by Qlerify and it exists to sell their tool; the event
  storming in it is sound, and the colours it teaches are Brandolini's, which
  are also the ones this notation uses.

Read both before facilitating a workshop. Neither this document nor the notation
beside it is a facilitation guide — they are what a model needs in order to be
useful to somebody who has already been in the room.`,
		provenance(`The notation a storm is written in is in \`${NOTATION_STEM}.md\`.`),
	].join('\n\n')}\n`;
}
