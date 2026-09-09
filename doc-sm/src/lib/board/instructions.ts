/**
 * The notation and the doctrine, written out for a session that is not here.
 *
 * Two Markdown files, and neither is about any particular map. Everything else
 * the export dialog offers is a rendering of the map on screen; these two are
 * the *reference* — what a `.storymap` file is, and what a good story map does
 * — addressed to a model that has never seen doc-sm.
 *
 * ## Why the tool ships its own instructions
 *
 * Because the alternative is what people do instead, which is paste half of a
 * remembered grammar into a prompt. A map lives in the repository of the
 * product it describes; the work of changing one therefore happens wherever
 * that repository is checked out, which is very often a terminal with an agent
 * in it and no doc-sm anywhere near. That session has to know the notation
 * exactly — an `@release` on an activity, or a ticket it invented, produces a
 * file that will not open or a file that lies — and it has to know the
 * doctrine, or it will tidy the unscheduled stories away, which is the half of
 * the map that says what the plan leaves out.
 *
 * ## Nothing here is written twice
 *
 * The body of both documents is `GRAMMAR`, `TAGS`, `EBNF`, `DOCTRINE` and
 * `EDITING` from src/lib/agent/guide.ts, verbatim. This module contributes the
 * framing —
 * who the reader is, what they are being asked to do, where the map came from
 * and where to read more — and not one sentence of the content.
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
export const NOTATION_STEM = 'storymap-notation';
export const DOCTRINE_STEM = 'storymap-doctrine';

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

*Exported from doc-sm, the story-mapping board these come from. It is a
snapshot of what that tool's own assistant is told, it does not update itself,
and nothing in it was generated from the map that happened to be
open.${extra === null ? '' : ` ${extra}`}*`;
}

/**
 * The notation, as instructions.
 *
 * The editing rules are here rather than in the doctrine, because they are
 * about the *file*: whose it is, what may be reformatted, and which two fields
 * belong to a system this tool does not own. Somebody handed only this document
 * is the person about to change a map, and those rules are the difference
 * between a diff a reviewer reads and a diff that has invented four tickets.
 */
export function notationDocument(): string {
	return `${[
		'# Working with `.storymap` files',
		`You are being asked to read, write or change a user story map — a plan for
*slicing* a product, kept as text, in a small declarative notation called
\`.storymap\`. This document is the whole of that notation. Follow it exactly: a
file that does not parse cannot be opened by the tools the map is kept for.`,
		GRAMMAR,
		/*
		 * Prose first, production set second, and never the other way round.
		 *
		 * Somebody who reads the formal grammar first learns what a file may
		 * contain and nothing about what any of it means — `Status` is six words
		 * in a list, and which one a card should carry is a question the grammar
		 * cannot answer and the worked example above can.
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

A map is a plan a room agreed on, and you are editing it in their absence. Every
rule below follows from that.

${EDITING}

Read \`${DOCTRINE_STEM}.md\` before adding or re-slicing cards. This notation will
happily let you write a map that parses perfectly and plans nothing.`,
		provenance(
			'The grammar itself is defined by `src/lib/storymap/` in doc-sm: where a map and these rules disagree, the parser is right and this file is old.',
		),
	].join('\n\n')}\n`;
}

/**
 * The doctrine, as instructions.
 *
 * The phases and the seam to event storming are not in the prompt this borrows
 * from, and that asymmetry is deliberate rather than an omission. The assistant
 * in the panel is always looking at a map that already exists; a session
 * reading this file may be asked to build one from a workshop's output, or to
 * plan the session that produces it, and neither makes sense without knowing
 * where a backbone comes from.
 */
export function doctrineDocument(): string {
	return `${[
		'# Reading a user story map',
		`User story mapping is Jeff Patton's, described in *User Story Mapping*
(O'Reilly, 2014) and at [jpattonassociates.com](https://www.jpattonassociates.com/story-mapping/).
It is a workshop: the team lays the user's journey out left to right as a
**backbone** of activities, breaks each into **steps**, hangs the **stories**
that deliver them underneath, and then draws horizontal lines across the whole
thing to say what ships when.

You are almost certainly talking to somebody who was in that room and knows the
product far better than you do. **Assume the facts on the map are true.** What
you have to offer is the reading: whether the backbone still tells a story,
whether each slice is a whole product, and whether the map is honest about what
it leaves out.`,
		`## Where a backbone comes from

The hard part of a map is the top row, and it is usually not invented at the
mapping session — it is discovered somewhere else and carried in.

The common route is an **event storm**. A storm lays the domain out as a
timeline of things that happened, and its *pivotal events* — the few that close
one stretch of the story and open the next — are exactly where one activity
ends and the next begins. A wall with its pivotal events marked (doc-es next
door writes them as \`+pivotal\`) hands you the backbone; one without them has to
be re-read from the beginning by whoever runs the mapping session.

A backbone can also come from a customer journey, a support call log, or an
afternoon of watching somebody do the job. What it must not come from is the
existing system's menu structure: that produces a row of features — "Search",
"Admin", "Reporting" — which is the failure the doctrine below names first.`,
		DOCTRINE,
		`## What not to do

**Do not tidy away the unscheduled stories.** They are not a backlog somebody
forgot to file. They are the map saying what the plan currently leaves out, and
deleting them turns a plan with a known edge into a plan that looks complete.

**Do not invent tickets or statuses.** \`#\` and \`~\` belong to the ticketing
system. A card that carries an id nothing issued makes the file lie about work
that exists somewhere else, and the lie is not visible in the map.

**Do not answer "is this ready?" with a slice.** Adding a delivery band is not
the same as agreeing one. If the map's first slice leaves an activity empty,
say so and say which — the room decides whether that is acceptable.`,
		`## Where this is described properly

- **[User Story Mapping](https://www.jpattonassociates.com/story-mapping/)** —
  Jeff Patton's own hub for the technique: the book, the quick reference, and
  the posts underneath it. This is the source, and where a disagreement between
  anything else and it should be settled.
- **[The New User Story Backlog is a Map](https://jpattonassociates.com/the-new-backlog/)**
  — the widely referenced post that predates the book, and still the clearest
  statement of the thing most summaries drop: a map exists so you can *slice*
  it, and a flat one-dimensional backlog is what it was written to replace.
  Patton's first account of the idea was an earlier article, *How You Slice It*
  (2005); this is the one people actually read.

Read them before facilitating a session. Neither this document nor the notation
beside it is a facilitation guide — they are what a model needs in order to be
useful to somebody who has already been in the room.`,
		provenance(`The notation a map is written in is in \`${NOTATION_STEM}.md\`.`),
	].join('\n\n')}\n`;
}
