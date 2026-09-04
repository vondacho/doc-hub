---
marp: true
header: 'Pitch - Living Documentation Hub'
footer: 'Technical architecture - Pictet Tech, OVD, 4.9.2026'
---

<!-- theme: uncover -->
<!-- size: 16:9 -->
<!-- class: invert -->

<style>
section {
  font-size: 26px;
  padding: 50px 60px;
}
section h1 {
  font-size: 1.7em;
  margin-bottom: 0.4em;
}
section h2 {
  font-size: 1.4em;
}
section ul {
  font-size: 0.95em;
  line-height: 1.4;
}
section table {
  font-size: 0.6em;
  margin: 0 auto;
}
section table th,
section table td {
  padding: 0.25em 0.6em;
  text-align: left;
}
section strong {
  color: var(--color-highlight-heading);
}
header,
footer {
  font-size: 0.55em;
}
</style>

Olivier von Dach

Software craftsman, **developer advocate**, and **technical architect** DevOps.

**Front Tech Team** - PWM, DCP, OBI, eSignature, Observability.

---

**Wiki** documentation is **intention**-based, and often outdated.
**Living** documentation is **up-to-date**, **automated**. 

To close the gap between intended and deployed.

---

Developers needs **digital contracts** to do the right thing, and the thing right.

---

# Living documentation hub

A set of **connected web portals** for every perspective, the **product** vision.

| Portal      | Perspective             | Audience        |
|-------------|-------------------------|-----------------|
| [doc-hub](http://doc-portal.obya.ch)     | Product 360             | PM, BA, Support |
| [ba-hub](http://ba-portal.obya.ch)      | Business analysis       | BA              |
| [qa-hub](http://qa-portal.obya.ch)      | Quality assurance       | QA              |
| [arch-hub](http://arch-portal.obya.ch)    | Software architecture   | SA, TA, Dev     |
| [api-hub](http://api-portal.obya.ch)     | API-first               | SA, TA, Dev, BA |
| [dev-hub](http://dev-portal.obya.ch)     | Software development    | Dev             |
| [C4 catalog](arch-c4.obya.ch) | Systems, containers, components | SA, TA, Dev, BA, Ops |
| [Event catalog](arch-eventcatalog.obya.ch) | Interactions between components | SA, TA, Dev, BA, Ops |
| [Component inventory](arch-inventory.obya.ch) | Inventory, dependencies | SA, TA, Dev, BA, Ops |
| [Drift detector](ba-sm.obya.ch) | Drift detection | SA, TA, BA |

---

# The code is the truth

Content is mainly provisioned by **automation**, from the codebases, CI.CD pipelines, and Observability.

---

# Digital contracts made easy

A set of **digital tools** to support the **practices** which create them.

| Tool      | Artefact | Contract |
|-----------|----------|----------|
| [Event stormer](doc-es.obya.ch) | .eventstorm | Big picture, Process modelling, System design | 
| [Context mapper](ba-cm.obya.ch) | .contextmap | Domains and Bounded contexts |
| [Domain modeller](ba-cm.obya.ch/model) | .domainmodel| Ubiquitous language, Aggregates, Invariants, Rules |
| [Story mapper](doc-sm.obya.ch) | .storymap | Why(journey), What(stories), When(mvp, milestones) |
| [Example mapper](doc-em.obya.ch) | .examplemap, gherkin | What(scenarios), Estimate(story pointing), FAT, NFRT |
| [MCP]() | code | Design patterns library |

---

# Contract-first development

**Self-contained** codebases.

Seamless **consumption** by ticketing, development, testing tools, and AI.

---

Thanks for your attention. Work connected.

<strong>[hub.obya.ch](https://hub.obya.ch)</strong>

---

# Capabilities

| [doc-hub](http://doc-portal.localhost) | [ba-hub](http://ba-portal.localhost)           | [arch-hub](http://arch-portal.localhost)         | [api-hub](http://api-portal.localhost) | [dev-hub](http://dev-portal.localhost)      | [qa-hub](http://qa-portal.localhost)       | ux-hub        |
|---------|----------------|---------------|--------------|--------------|---------------|---------------|
| product documentation | business analysis practices | reference architecture | api design guidelines | process, practices, patterns | test strategy | ux guidelines  |
| product catalog | [ddd modelling](http://ba-ddd-mapper.localhost) | [c4 modelling](http://arch-c4.localhost) | api onboarding |[story mapping](http://doc-sm.localhost)| campaign authoring | design system |
| product monitoring | ddd monitoring | [event catalog](http://arch-c4.localhost) | api catalog | [example mapping](http://doc-em.localhost) | campaign reporting | component registry |
| [story mapping](http://doc-sm.localhost) | [process modelling](http://doc-es.localhost) | [event storming](http://doc-es.localhost) | api monitoring | [collaborative software design](http://doc-es.localhost) | - | - |
| synthetic reporting | ddd catalog | component catalog | api mocking | - | - | - |
| - | context dependencies | component dependencies | api scoring | - | - | - |
| - | mcp | mcp | mcp | mcp | mcp | mcp |
| - | academy | academy | academy | academy | academy | academy |
