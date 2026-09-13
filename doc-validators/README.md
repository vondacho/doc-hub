# `docdsl` — validators for doc-hub's three DSLs

Python validators for the three source-text formats the doc-hub boards read and
write, built from the doctrines and the BNF grammars those boards ship:

| Format | Board | Grammar | Doctrine |
|---|---|---|---|
| `.eventstorm` | `doc-es` | `doc-es/doc/es-grammar.md` | `doc-es/eventstorm-doctrine.md` |
| `.storymap` | `doc-sm` | `doc-sm/doc/sm-grammar.md` | `doc-sm/storymap-doctrine.md` |
| `.examplemap` | `doc-em` | `doc-em/doc/em-grammar.md` | `doc-em/examplemap-doctrine.md` |

No dependencies, standard library only. The boards' own parsers depend on
nothing but their runtime, and a validator that has to be installed before a CI
job can read a story map is a validator nobody runs.

```
python3 -m docdsl.cli path/to/map.examplemap
python3 -m docdsl.cli .                      # walk a tree for all three
python3 -m docdsl.cli . --strict --quiet     # CI: fail on doctrine warnings too
python3 -m docdsl.cli . --json               # one object per file
```

---

## Two levels, kept apart

This is the one design decision in the package worth arguing about.

**The grammar is decidable.** `@0` is wrong, a duplicate tag is wrong, an `@`
naming a band nobody declared is wrong, and there is nothing to discuss. These
come from the BNF and are reported as **errors**, with the same messages, hints
and fifty-problem ceiling the boards' own TypeScript parsers use.

**The doctrine is not decidable.** A wall with no hotspots on it, a rule with no
examples under it, a first slice that leaves an activity empty — all three are
valid files, and all three are the *first thing* their doctrine tells you to
look at. These are reported as **warnings** and **readings**, and they are
phrased as questions to ask the room, because the doctrines are explicit that
the person holding the file was in that room and knows the domain far better
than this package does.

So a doctrine finding never fails a run unless you ask for it:

```
exit 0   every file parses (and under --strict carries no doctrine warnings)
exit 1   at least one file has a grammar error
exit 2   --strict, everything parses, and a doctrine warning stands
exit 3   the invocation was wrong — no such file, unrecognisable format
```

`2` is separate from `1` on purpose. "This is not a valid story map" and "this
story map's first slice leaves an activity empty" are different claims, and a
pipeline that blocks on the first and reports the second wants to tell them
apart without parsing the output.

---

## What the doctrine checks

Each finding carries a stable kebab-case `code`, so a team can grep for one,
count it across a repository, or decide it disagrees with one.

### Event storming — `es-*`

| Code | Severity | Reading |
|---|---|---|
| `es-no-hotspots` | warning | The most valuable card on the wall is the red one. A storm that has produced none has not been honest yet. |
| `es-event-reads-as-command` | warning | `Place order` is a command wearing an event's colour. |
| `es-event-not-past-tense` | info | An event carrying no past-tense verb. |
| `es-command-not-imperative` | warning | A command that reads as something that already happened. |
| `es-policy-chain-hole` | warning | A policy with no event before it or no command after it. |
| `es-policy-not-a-rule` | info | A policy that does not say what it reacts to. |
| `es-unowned-run` | warning | Four events in a row with no actor and no system near them. |
| `es-lane-off-the-clock` | warning | A lane whose whole stretch sits outside every other lane's. |
| `es-opportunity-without-hotspot` | info | A solution looking for its problem. |
| `es-no-contexts` | info | Finding the seams is the last phase of a big picture. |
| `es-level`, `es-loose-cards`, `es-empty-wall` | info | Readings of the wall's shape. |
| `es-level-disagrees` | warning | A retired `level` line that no longer matches the cards. |

### Story mapping — `sm-*`

| Code | Severity | Reading |
|---|---|---|
| `sm-slice-is-a-prefix` | warning | The first delivery leaves an activity empty — a plan to ship a product that stops working halfway through the job. |
| `sm-backbone-reads-as-features` | warning | An activity that names a thing rather than a job. |
| `sm-crowded-step` | warning | A step with a great many stories is usually two steps. |
| `sm-thin-step` | info | A step with one story is the story; the level above it is doing no work. |
| `sm-so-restates-want` | warning | A `so` that restates the `want` is a story nobody has justified. |
| `sm-no-so` | info | What is wanted, and not why. |
| `sm-activity-for-everyone` | info | An activity every persona touches is often not one activity. |
| `sm-below-the-line` | info | What the plan currently leaves out. Named, never proposed for tidying. |
| `sm-shape`, `sm-no-deliveries`, `sm-no-personas`, `sm-empty-map` | info | Readings of the map's shape. |
| `sm-legacy-release-spelling` | info | The older `release "…"` spelling, which still parses. |

### Example mapping — `em-*`

| Code | Severity | Reading |
|---|---|---|
| `em-rule-without-examples` | warning | A rule nobody understands yet. The first thing to look for, every time. |
| `em-no-questions` | warning | A session that produced no questions did not discover anything. |
| `em-not-ready-to-estimate` | warning | Four or more open questions. |
| `em-story-too-big` | warning | Many rules; the rules are where to split it. |
| `em-crowded-rule` | warning | Two rules wearing one sentence. |
| `em-example-restates-rule` | warning | The rule again, making an unexamined rule look examined. |
| `em-so-restates-want` | warning | The `so` clause is the half that gets dropped first and missed most. |
| `em-example-not-concrete` | warning | No numbers, dates or names, so no `given` is testable. |
| `em-only-denials` | warning | Every `then` says a thing did not happen. |
| `em-rule-is-all-questions` | warning | Questions and no examples. |
| `em-late-example` | warning | An example scheduled after the story ships — ordinary while replanning, hence a warning. |
| `em-example-without-steps`, `em-no-when` | info | A scenario that would pass without asserting anything. |
| `em-questions-do-not-cross`, `em-rules-without-scenarios` | info | What the generated `.feature` will be missing. |
| `em-shape`, `em-points`, `em-reads-as-ready`, `em-no-story`, `em-no-need` | info | Readings of the map's shape. |

### What is deliberately *not* checked

Each doctrine has a "what not to do" section, and those are honoured by
omission rather than by a check. No finding in this package:

- resolves a hotspot, or proposes an answer to a red card;
- invents a domain fact, a ticket, a status, or an example;
- suggests turning a hotspot or a question into a tag;
- suggests tidying away an unscheduled story;
- answers "is this ready?" — the counts are reported and the room decides.

---

## Library use

```python
from docdsl import validate_file, validate, Severity

result = validate_file("docs/redeem-a-voucher.examplemap")

result.parses                 # no grammar errors
result.errors                 # grammar findings
result.warnings               # doctrine findings worth acting on
result.infos                  # readings
result.findings               # everything, worst first then in file order
result.ok(strict=True)        # would this fail a strict build?
print(result.summary())

result.document.rules[0].examples        # the parsed model
result.document.story.want
```

Each format also exposes its own parser and doctrine:

```python
from docdsl.eventstorm import parse, parse_collecting, doctrine

storm = parse(source)                     # raises EventStormParseError
storm, problems = parse_collecting(source)  # or collect them
storm.deepest_level                       # 'process-modelling'
readings = doctrine.read(storm)
```

`parse()` raises on the first *call*, not the first problem: the exception
carries every problem found. These files are hand-edited with no language
server, so failing on one would mean one trip through a file dialog per typo.

---

## Layout

```
docdsl/
  problems.py        positions, severities, the fifty-problem ceiling
  lexer.py           one scanner for all three; the keyword set is a parameter
  parsing.py         the recursive-descent scaffolding the three parsers share
  prose.py           the text heuristics the three doctrines share
  api.py             validate() / validate_file(), format detection
  cli.py             docdsl-validate
  eventstorm/        model.py  parser.py  doctrine.py
  storymap/          model.py  parser.py  doctrine.py
  examplemap/        model.py  parser.py  doctrine.py
samples/             the worked example from each grammar document
tests/               157 tests, stdlib unittest, no pytest needed
```

The TypeScript side copies `lexer.ts` and `problems.ts` between the three
boards — that is what made the copy a copy. Here they are imported three times
instead, with the keyword set passed in.

```
python3 -m unittest discover -s tests -t .
```

---

## Two places this diverges from the boards, and why

**`level` is retired in `.eventstorm`.** `doc-es/doc/es-grammar.md` still
describes `level big-picture | process-modelling | software-design` as declared,
at most once, with a card the declared level does not admit being an error.
`doc-es/src/lib/eventstorm/` no longer agrees: the keyword is parsed and
discarded, and `Level` in `model.ts` says why — the line was derivable, a wall
with a command on it *is* a process model, and a declaration that may only ever
restate its content is a duplicate, and the duplicate is what drifts.

This package follows the code. A `level` line parses, is recorded, and produces
`es-level-retired` (info) when it agrees with the cards or
`es-level-disagrees` (warning) when it does not — never an error, because the
line was correct when it was written. **The grammar document is the stale one
here.**

**Columns are code points, not UTF-16 code units.** The boards count in UTF-16
because that is what a browser text editor addresses; this counts in code
points because that is what a terminal caret and Python's slicing address. The
two agree on every ASCII file and differ by one per astral character (an emoji
in a title) on the same line.
