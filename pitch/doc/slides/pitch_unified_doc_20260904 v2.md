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

# Needs

| Audience    | Contracts    | Guidelines       | Living |
|-------------|--------------|------------------|--------|
| DEV         | User journey | Design patterns  | C4           |
|             | User stories | Testing patterns | EventCatalog |
|             | Milestones | Testing patterns | EventCatalog |
|             | Functional scenarios | Testing patterns | EventCatalog |
|             | N-Functional scenarios | Testing patterns | EventCatalog |
|             | USer stories | Testing patterns | EventCatalog |
|             | USer stories | Testing patterns | EventCatalog |
|             | USer stories | Testing patterns | EventCatalog |


---

# Solutions

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
