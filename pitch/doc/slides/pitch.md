---
marp: true
header: 'Pitch - Living Documentation Hub'
footer: 'Technical architecture - Pictet Tech, OVD, Q3-2026'
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

**Wiki** documentation is **intention**-based, and often outdated.
**Living** documentation is **up-to-date**, **automated**. 

To close the gap between intended and really deployed.

---

# Living documentation hub

A set of **connected web portals** for every perspective, organized by product.

| Portal      | Perspective             | Audience        |
|-------------|-------------------------|-----------------|
| [doc-hub](http://doc-portal.localhost)     | Product 360             | PM, BA, Support |
| [ba-hub](http://ba-portal.localhost)      | Business analysis       | BA              |
| [arch-hub](http://arch-portal.localhost)    | Software architecture   | SA, TA, Dev     |
| [api-hub](http://api-portal.localhost)     | API-first               | SA, TA, Dev, BA |
| [dev-hub](http://dev-portal.localhost)     | Software development    | Dev             |
| [qa-hub](http://qa-portal.localhost)      | Quality assurance       | QA              |
| ux-hub      | User experience         | UX, dev         |

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

---

# Content management

The content is mainly provisioned by **automation**, ie, CI.CD pipelines on 'develop' branch, campaigns executions, HELM deployments, and observability.

---

# Solution proposal

- Content-driven web portal with [Astro](https://astro.build/)
- Microservices architecture
- SpringBoot, Node.js, Typescript, Strapi/PostgresSQL/MongoDB
- Kubernetes/Helm
- OTEL

---

# Plan

- MVP (**DCP**): **API catalog**, **C4 workspace**, and **EventCatalog**
- MVP (DCP): **api-hub**, **arch-hub**
- R1 (DCP): **dev-hub**, **ba-hub**
- R2 (DCP): **qa-hub**, **doc-hub**
- To work on the **observability** topic
- To promote the Living Documentation Hub @ **Pictet Tech**
- To onboard **Dev** teams with their **APIs** and **C4** workspaces
- To onboard **QA** and **UX** teams: **qa-hub**, **ux-hub**
- To build Living documentation/**MCP** use cases

---

## Thanks.

>Stay **up-to-date**, stay informed, and stay ahead with our **Living Documentation Hub**.

---

## Links

Enterprise architect: Patrick Doyle
Innovation: Sebastien Gille
API hub: Carine Leroux
PWM-AI governance: Luis