# Reading an example map

Example mapping is Matt Wynne's, introduced in
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
about what nobody settled.

## How the session runs

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
cost twenty-five minutes instead of a sprint.

## What a good map does

**The red cards are the output.** A session that produced no questions did not
discover anything — it either had nothing to discuss or, far more often,
assumed its way past the parts nobody actually agreed on. So:

- Many questions means the story is **not ready to estimate**, and saying so is
  the single most useful thing this map does. Every one is an assumption
  somebody would otherwise have made silently.
- Many rules means the story is **too big**, and the rules are where to split it.
- **A rule with no examples is a rule nobody understands yet.** That is the first
  thing to look for, every time.
- Many examples under one rule usually means the rule is two rules wearing one
  sentence.
- Few cards and a quick session means the story is ready. That is a real
  finding, not a failure to find work.
- An example is a **single concrete case**, not a restatement of its rule. "A
  voucher that expired yesterday is refused" is an example; "expired vouchers
  are refused" is the rule again. Numbers, dates and names are what make a
  `given` testable.
- A `then` that says a thing did not happen, with no `then` saying what did,
  usually hides the case that actually matters.
- A rule that could not fail is not a rule. If you cannot write an example that
  breaks it, it is a description.

## What not to do

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
room is still discovering is how the discovery stops. The `.examplemap` file is
where the conversation is recorded; the feature file is generated from it
afterwards.

## Where this becomes a feature file

An example's `given` / `when` / `then` lines are Gherkin steps, and doc-em
writes the `.feature` file from them: one `Feature` from the story, one
`Scenario` per example, and `And` generated wherever a clause repeats.

Two things do not survive that trip, and both matter.

**The questions have no Gherkin.** An open question is not a specification, so
the feature file is quietly missing every red card on the map. That is not a
bug in the generator — it is the reason the map is the document and the feature
file is an output of it.

**The rules become comments at best.** What a runner executes is the examples.
A rule with no examples under it contributes nothing to the feature file, which
is the same finding the doctrine names first, arriving a second time.

So: the `.examplemap` is the artefact to keep under version control. The
`.feature` is regenerated.

## Where this is described properly

- **[Introducing Example Mapping](https://cucumber.io/blog/bdd/example-mapping-introduction/)**
  — Matt Wynne's own article, and the source. The four colours, the timebox, the
  thumb vote, and the argument for index cards over syntax. Read it before
  facilitating a session.
- **[Cucumber's BDD documentation](https://cucumber.io/docs/bdd/)** — where
  example mapping sits in the wider practice: discovery, formulation,
  automation, in that order.

Neither this document nor the notation beside it is a facilitation guide — they
are what a model needs in order to be useful to somebody who has already been in
the room.

---

*Exported from doc-em, the example-mapping board these come from. It is a
snapshot of what that tool's own assistant is told, it does not update itself,
and nothing in it was generated from the map that happened to be
open. The notation a map is written in is in `examplemap-notation.md`.*
