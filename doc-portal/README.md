# doc-portal

The **product documentation** portal of the living documentation hub — the
perspective a product manager or business analyst arrives with: *what does this
product do, who owns it, where is it going, and how current is what I am
reading?*

It is scaffolded on the same model as `dev-hub/dev-portal`: Astro in server
mode behind the Node adapter, Tailwind 4 as a Vite plugin, the same
`Hero` / `SectionPanels` / `SiteFooter` components, the same `links.ts` +
`/go/*` treatment of neighbouring-hub addresses, and the same Dockerfile shape.

Two deliberate differences from `dev-portal`:

- **No Starlight.** `dev-portal` hosts a handwritten book under `/doc/*`. This
  hub's prose is per-product living documentation coming from the registry and
  the pipelines, so there is nothing to prerender. Add the integration the day a
  handwritten section actually exists.
- **No testimonials band.** The home page is banner → panels → search.

## Pages

| Route | What it is |
|---|---|
| `/` | Banner, the three panels (Catalog, Landscape, Registration), and the catalog's search bar |
| `/catalog` | Search bar and results — product cards, **ten per page**, `?q=` and `?page=` in the URL |
| `/catalog/<product>` | Product view: a details band, an indicators band, then the eight perspective panels |
| `/catalog/<product>/<section>` | The six perspectives this hub owns — documentation, roadmap, epics, sprints, campaigns, incidents |
| `/landscape` | The two cross-product landscapes: C4 and Events, both in model-hub |
| `/registration` | Register a product: a server-validated form. The registry is live but read-only to this portal — see *What is not built* |
| `/go/<target>` | 302 to a neighbouring hub, resolved from the environment per request |
| `/healthz` | `{"status":"UP"}` for the chart's probes |

## The data comes from the registry

`src/lib/products.ts` reads `doc-registry`, the Strapi CMS in this repo, over
its content API on every request. It used to hold sixteen invented products and
promise that replacing them was a one-file job — `searchProducts`, `findProduct`
and `paginate` being the entire surface the pages use, so that swapping the seed
array for a fetch and making those `async` would change nothing above them. That
is what happened: the pages differ from before by `await` and by an error
branch, and nothing else.

The sixteen products did not disappear, they moved — `doc-registry` seeds them
into an empty collection on first boot, so the catalog looks the same while now
being editable by a human and writable by a pipeline.

**Search and pagination stay here**, in the portal, rather than becoming query
parameters. The behaviour is already specified down to "every term has to match"
and "an out-of-range page is clamped, not empty"; and the whole set has to be
fetched for the count anyway, so pushing the filter into Strapi would trade an
in-memory `filter` for a query language and buy nothing until the catalog is
large enough that the fetch itself is the problem.

**An unreachable registry is an outage, not an empty catalog.** `/catalog`
renders a panel naming the failure and answers **503**; a product view answers
503 rather than 404, because "this product does not exist" and "I could not find
out whether it exists" are different claims and only one of them is true.
`/healthz` is deliberately left out of it: the probe does not touch the
registry, so a CMS blip does not get the portal restarted by its own kubelet.

Two more things follow the same rule as the registry did:

- `src/lib/indicators.ts` holds every status threshold. A status decided inside a
  component gets decided twice, differently, the first time a second page shows
  the same number.
- `src/lib/product-sections.ts` holds the eight perspectives, which of them are
  internal pages and which link out to another hub.

## Configuration

Addresses of the neighbouring hubs, read per request (`src/lib/links.ts`), so
changing one takes a restart rather than a rebuild:

| Variable | Default                              | Used by |
|---|--------------------------------------|---|
| `API_PORTAL_URL` | `http://api-portal.localhost`        | Footer |
| `MODEL_PORTAL_URL` | `http://arch-portal.localhost`       | `/landscape` |
| `MODEL_C4_URL` | `http://arch-c4.localhost`           | `/landscape`, the C4 panel of every product |
| `MODEL_EVENTCATALOG_URL` | `http://arch-eventcatalog.localhost` | `/landscape`, the Events panel of every product |
| `DEV_PORTAL_URL` | `http://dev-portal.localhost`        | Footer |
| `QA_PORTAL_URL` | `http://qa-portal.localhost`         | The campaigns section |
| `REGISTRY_URL` | `http://doc-registry.localhost`      | `/registration` — printed, and the admin-UI link |
| `REGISTRY_API_URL` | `http://localhost:1337`          | **The catalog.** In-cluster, not an ingress host — see below |

`HOST` and `PORT` (default `4321`) are read by the standalone Node adapter.

`REGISTRY_API_URL` is the one address here that is **not** browser-facing. The
catalog is fetched during server-side rendering, so the request leaves this
server's own process; in the cluster the right address is the Service name
(`http://doc-registry:1337`), and the ingress host would route back out through
Traefik and in again to reach something one DNS name away. `src/lib/links.ts`
keeps `registryUrl()` and `registryApiUrl()` apart for exactly that reason. The
default is `doc-registry`'s dev server, so a local portal finds a local registry
with no configuration.

## Develop

```sh
npm install
npm run dev        # http://localhost:4321
npm run build      # dist/server/entry.mjs + dist/client
npm start          # serve the build
```

The catalog needs a registry to read. Either run one locally —
`cd ../doc-registry && npm run develop`, which listens on the port
`REGISTRY_API_URL` already defaults to — or point at the deployed one:

```sh
REGISTRY_API_URL=http://doc-registry.localhost npm run dev
```

Every other page works without it.

## Container

```sh
docker build -t doc-portal .
docker run --rm -p 4321:4321 \
  -e REGISTRY_API_URL=http://doc-registry.localhost \
  -e MODEL_C4_URL=https://c4.example.org doc-portal
```

## What is not built

- **Registration still only validates.** The registry grants the public role
  `find` and `findOne` only, so this portal can list products without a
  credential and cannot create one — which is deliberate, since a create
  endpoint open to the internet is a registry anybody can fill. Wiring it up is
  one POST from `registration.astro` carrying an API token minted in the
  registry's admin UI and injected as a Secret.
- **Nothing writes the metrics.** They are whatever the registry holds, which
  today is the seeded placeholder numbers. The pipelines that will report them
  are the next thing the registry needs, not the portal.
- The six internal per-product sections. Each renders a page saying what it will
  hold and which automation will fill it — a page rather than a dead link,
  because a panel that goes nowhere teaches visitors to stop clicking panels.
- Deep links into model-hub. The C4 and Events panels open the hub root; the
  per-product path shape is model-hub's to define, and inventing one here would
  produce a link that 404s the day it is deployed.
