---
marp: true
header: 'Pitch - Living Documentation Hub'
footer: 'Technical architecture - Pictet Tech, OVD, 11.8.2026'
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

| Portal        | Perspective             | Audience                                                |
|---------------|-------------------------|---------------------------------------------------------|
| **doc-hub**   | product documentation   | **PM**, **BA**                                          |
| **api-hub**   | product API             | **solution architects**, **developers**, **PM**, **BA** |
| **model-hub** | product architecture    | **solution architects**, **developers**                 |
| **dev-hub**   | product development     | **developers**                                          |
| **qa-hub**    | product quality         | **quality engineers**                                   |
| **ux-hub**    | product user experience | **UX designers**                                        |

---

# Capabilities

| doc-hub | api-hub               | model-hub         | dev-hub      | qa-hub       | ux-hub        |
|---------|-----------------------|-------------------|--------------|--------------|---------------|
| create  | onboarding            | c4-landscape      | _guidelines_ | reports      | design-system |
| search  | scoring               | **c4-system**     | patterns     | campaigns    | components    |
| -       | **contracts catalog** | **c4-containers** | **mcp**      | _guidelines_ | mockups       |
| -       | registry              | **c4-components** | -            | requirements | -             |
| -       | discovery             | **c4-deployment** | -            | nfr          | -             |
| -       | monitoring            | **dependencies**  | -            | -            | -             |
| -       | **lifecycle**         | monitoring        | -            | -            | -             |
| -       | _change management_   | appmap            | -            | -            | -             |
| -       | mocking               | processes         | -            | -            | -             |
| -       | _guidelines_          | dsl               | -            | -            | -             |
| -       | REST, GraphQL         | **mcp**           | -            | -            | -             |
| -       | Grpc, Async           | -                 | -            | -            | -             |
| -       | **mcp**               | -                 | -            | -            | -             |

---

# Content management

The content is mainly provisioned by **automation**, ie, CI.CD pipelines on 'develop' branch, campaigns executions, HELM deployments, and observability.

---

# Solution proposal

- Microservices architecture
- Content-driven web frontend with [Astro](https://astro.build/)
- Registry with [Strapi](https://strapi.io/) CMS
- [Microcks](https://microcks.io/) for contract-first API mocking and testing
- DDD modeling with [Context Mapper](https://contextmapper.org/) DSL
- Architecture modeling with [LikeC4](https://likec4.com/) or [EventCatalog](https://www.eventcatalog.dev/) DSL
- UML modeling with [PlantUML](https://plantuml.com/) DSL
- BPMN and DMN modeling with [bpmn.io](https://bpmn.io/)
- Code behaviour visualization with [AppMap](https://appmap.io/)
- [Allure](https://allure.qameta.io/) and [Serenity BDD](https://serenity-bdd.github.io/) for tests reporting
- [reshapr](https://reshapr.io/), your API as an MCP server
- [solo.io](https://www.solo.io/products/agentregistry), an MCP server registry
- SpringBoot, Node.js, Typescript

---

# Plan

- MVP with **DCP**: **API catalog**, **C4 workspace**, and **EventCatalog**
- MVP: **doc-hub**, **api-hub**, **model-hub**
- To evangelize the Living Documentation Hub to the **Pictet Tech** community
- To collaborate with **Ops**
- To onboard **Dev** teams with their **APIs** and **C4** workspaces
- To onboard **QA** and **UX** teams: **qa-hub**, **ux-hub**
- To build **MCP** use cases and promote an **mcp-hub**

---

## Thanks.

>Stay **up-to-date**, stay informed, and stay ahead with our **Living Documentation Hub**.

