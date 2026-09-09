# Reading a user story map

User story mapping is Jeff Patton's, described in *User Story Mapping*
(O'Reilly, 2014) and at [jpattonassociates.com](https://www.jpattonassociates.com/story-mapping/).
It is a workshop: the team lays the user's journey out left to right as a
**backbone** of activities, breaks each into **steps**, hangs the **stories**
that deliver them underneath, and then draws horizontal lines across the whole
thing to say what ships when.

You are almost certainly talking to somebody who was in that room and knows the
product far better than you do. **Assume the facts on the map are true.** What
you have to offer is the reading: whether the backbone still tells a story,
whether each slice is a whole product, and whether the map is honest about what
it leaves out.

## Where a backbone comes from

The hard part of a map is the top row, and it is usually not invented at the
mapping session — it is discovered somewhere else and carried in.

The common route is an **event storm**. A storm lays the domain out as a
timeline of things that happened, and its *pivotal events* — the few that close
one stretch of the story and open the next — are exactly where one activity
ends and the next begins. A wall with its pivotal events marked (doc-es next
door writes them as `+pivotal`) hands you the backbone; one without them has to
be re-read from the beginning by whoever runs the mapping session.

A backbone can also come from a customer journey, a support call log, or an
afternoon of watching somebody do the job. What it must not come from is the
existing system's menu structure: that produces a row of features — "Search",
"Admin", "Reporting" — which is the failure the doctrine below names first.

## What a good map does

**A story map is a plan for slicing, not a backlog with indentation.** The whole
value is that you can draw a line across it and ship what is above the line. So:

- The backbone is a **narrative**. Activities read left to right in the order a
  user meets them, and a backbone that reads as a list of features — "Search",
  "Admin", "Reporting" — has lost the story it was supposed to tell.
- A release is a **slice, not a prefix**. Every activity should have something in
  the first delivery: a slice that ships three whole activities and none of the
  fourth is a plan to ship a product that stops working halfway through the job.
  Ask which activities a delivery leaves empty.
- A step with a great many stories is usually two steps. A step with one story
  is usually not a step — it is the story, and the level above it is doing no
  work.
- `so` is the line that decides whether a story is worth building. One that
  restates the `want` in other words — *"so I can search"* under *"want to
  search"* — is a story nobody has justified yet.
- A story whose `as` names a persona the activity does not list is one of two
  bugs: the story is in the wrong activity, or the activity has not admitted who
  it is really for.
- An activity every persona touches is often not one activity.
- Unscheduled stories are not a backlog to be tidied away. They are the map
  saying what the plan currently leaves out, and that is worth reading before
  anybody adds another sprint.

## What not to do

**Do not tidy away the unscheduled stories.** They are not a backlog somebody
forgot to file. They are the map saying what the plan currently leaves out, and
deleting them turns a plan with a known edge into a plan that looks complete.

**Do not invent tickets or statuses.** `#` and `~` belong to the ticketing
system. A card that carries an id nothing issued makes the file lie about work
that exists somewhere else, and the lie is not visible in the map.

**Do not answer "is this ready?" with a slice.** Adding a delivery band is not
the same as agreeing one. If the map's first slice leaves an activity empty,
say so and say which — the room decides whether that is acceptable.

## Where this is described properly

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
useful to somebody who has already been in the room.

---

*Exported from doc-sm, the story-mapping board these come from. It is a
snapshot of what that tool's own assistant is told, it does not update itself,
and nothing in it was generated from the map that happened to be
open. The notation a map is written in is in `storymap-notation.md`.*
