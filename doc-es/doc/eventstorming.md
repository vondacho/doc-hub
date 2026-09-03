# Event storming

> Discovering a domain with the people who live in it, by putting what happens
> on a wall in the order it happens.

A workshop where domain experts, developers, architects and the product owner
build a shared picture of the domain by writing down everything that *happens*,
in orange, in time order, on a wall long enough to make everyone uncomfortable.

![An event storming wall: orange domain events along a timeline, with blue commands, yellow actors and purple policies around them, a red hotspot marking an unsettled disagreement, and two dashed frames marking candidate bounded contexts.](img/event-storming.svg)

Event storming was created by **Alberto Brandolini**, who described the format in
*Introducing EventStorming*. The official site is
[eventstorming.com](https://www.eventstorming.com/).

## How it runs

1. **Chaotic exploration.** Everyone writes domain events — past tense, business
   language, `Order placed`, `Payment refused` — and sticks them up. No
   discussion yet. The mess is the point: it shows where the disagreement is.
2. **Enforce the timeline.** Order them left to right. Duplicates collapse,
   contradictions surface, and someone says "that never happens" about a note
   another department wrote.
3. **Add the causes.** Commands that trigger events, the actors who issue them,
   the policies that react to them, the external systems involved.
4. **Find the seams.** Clusters of events that share a language and change
   together are candidate boundaries. This is the output the architecture uses.

## What it produces

A wall — photographed, then transcribed into whatever the team keeps under
version control. In this platform that transcription usually becomes a C4 model
or a set of registered events, so the workshop output stops being a photograph
nobody opens again.

## Why it is worth the room

It is the fastest way to discover that two departments use the same word for two
different things. That discovery is worth days of design, and it does not happen
in a document review — it happens when both people are looking at the same wall
and one of them says "wait, that's not what we mean by *account*."

## When to run it

At the start of a new domain, before a large restructuring, or when a team has
been arguing about boundaries for longer than a sprint. Not for a small feature:
the setup cost only pays back at scale.

## Where it leads

The seams found here become bounded contexts, and the events on the wall become
the ones registered in the event catalogue. Naming those seams and keeping their
language intact all the way into the code is domain-driven design — this
workshop is the room its strategic half is usually discovered in.

What the workshop does not produce is an order of work: for that, the same room
runs story mapping, which lays the user's journey out and cuts it into releases.
The individual stories then go to three amigos next.

## The official source

[eventstorming.com](https://www.eventstorming.com/) is Alberto Brandolini's own
site: the format's definition, the note colours, the workshop variants
(big picture, process modelling, software design) and the book. Read it before
facilitating one — this page is a summary of why we run it, not a facilitation
guide.

---

*Exported from `dev-hub/dev-portal/src/content/docs/doc/practices/event-storming.mdx`.
Cross-references in the original link to `/go/c4` and `/go/events` on the
platform, and to the sibling practices on dev-portal:
`/doc/practices/ddd/`, `/doc/practices/story-mapping/` and
`/doc/practices/three-amigos/`. The figure is
`public/img/practices/event-storming.svg` in that component.*
