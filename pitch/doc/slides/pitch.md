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
**Living** documentation is **up-to-date**, **automated**, and closes the gap between intended and really deployed.
-
We want to support the **Product vision** and document for different **audiences** and **perspectives**.

---

# Living documentation hub

A set of **connected web portals** for every perspective, organized by product.

| Portal        | Perspective               | Audience                                |
|---------------|---------------------------|-----------------------------------------|
| **doc-hub**   | product documentation     | **PM**, **BA**, **Support**             |
| **api-hub**   | product API               | **SA**, **TA**, **Dev**, **PM**, **BA** |
| **arch-hub**  | product architecture      | **SA**, **TA**, **Dev**                 |
| **dev-hub**   | product development       | **Dev**                                 |
| **qa-hub**    | product quality assurance | **QA**                                  |
| **ux-hub**    | product user experience   | **UX**                                  |

---

# Capabilities

| doc-hub | api-hub           | arch-hub         | dev-hub      | qa-hub       | ux-hub        |
|---------|-------------------|------------------|--------------|--------------|---------------|
| create  | onboarding        | c4-landscape     | _guidelines_ | _guidelines_ | design-system |
| search  | scoring           | events-landscape | patterns     | campaigns    | components    |
| -       | **catalog**       | api-landscape    | practices    | academy      | mockups       |
| -       | registry          | ddd-landscape    | stacks       | -            | -             |
| -       | discovery         | components       | testing      | -            | -             |
| -       | monitoring        | dependencies     | **mcp**      | -            | -             |
| -       | **lifecycle**     | databases        | academy      | -            | -             |
| -       | change management | processes        | -            | -            | -             |
| -       | mocking           | **mcp**          | -            | -            | -             |
| -       | REST, GraphQL     | academy          | -            | -            | -             |
| -       | Grpc, Async       | _guidelines_     | -            | -            | -             |
| -       | **mcp**           | -                | -            | -            | -             |
| -       | _guidelines_      | -                | -            | -            | -             |

---

# Content management

The content is mainly provisioned by **automation**, ie, CI.CD pipelines on 'develop' branch, campaigns executions, HELM deployments, and observability.

---

# Solution proposal

- Microservices architecture
- Content-driven web frontend with [Astro](https://astro.build/)
- Registry with [Strapi](https://strapi.io/) CMS
- [Microcks](https://microcks.io/) for contract-first API mocking and conformance testing
- DDD modeling with [Context Mapper](https://contextmapper.org/) DSL
- Architecture modeling with [LikeC4](https://likec4.com/) and [EventCatalog](https://www.eventcatalog.dev/) DSL
- UML modeling with [PlantUML](https://plantuml.com/) DSL
- BPMN and DMN modeling with [bpmn.io](https://bpmn.io/)
- Code behaviour visualization with [AppMap](https://appmap.io/)
- [Allure](https://allure.qameta.io/) for tests reporting
- [reshapr](https://reshapr.io/), your API as an MCP server
- [solo.io](https://www.solo.io/products/agentregistry), an MCP server registry
- SpringBoot, Node.js, Typescript

---

# Plan

- MVP with **DCP**: **API catalog**, **C4 workspace**, and **EventCatalog**
- MVP: **doc-hub**, **api-hub**, **arch-hub**
- To evangelize the Living Documentation Hub to the **Pictet Tech** community
- To collaborate with **Ops**
- To onboard **Dev** teams with their **APIs** and **C4** workspaces
- To onboard **QA** and **UX** teams: **qa-hub**, **ux-hub**
- To build **MCP** use cases and promote an **mcp-hub**

---

## Thanks.

>Stay **up-to-date**, stay informed, and stay ahead with our **Living Documentation Hub**.

