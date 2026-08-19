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
| `/registration` | Register a product: a server-validated form over a registry that is not wired yet |
| `/go/<target>` | 302 to a neighbouring hub, resolved from the environment per request |
| `/healthz` | `{"status":"UP"}` for the chart's probes |

## The data is a placeholder

`src/lib/products.ts` holds sixteen invented products so that search, pagination
and the product view have something to render. The registry the pitch describes
(Strapi, fed by CI/CD, campaign runs, Helm deployments and observability) does
not exist yet.

Replacing it is a one-file job by design: `searchProducts`, `findProduct` and
`paginate` are the entire surface the pages use, so swapping the seed array for a
fetch — and making those three `async` — changes nothing above them.

Two more things follow the same rule:

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
| `REGISTRY_URL` | `http://doc-registry.localhost`      | `/registration`, once it posts |

`HOST` and `PORT` (default `4321`) are read by the standalone Node adapter.

## Develop

```sh
npm install
npm run dev        # http://localhost:4321
npm run build      # dist/server/entry.mjs + dist/client
npm start          # serve the build
```

## Container

```sh
docker build -t doc-portal .
docker run --rm -p 4321:4321 -e MODEL_C4_URL=https://c4.example.org doc-portal
```

## What is not built

- The registry, and with it every real product entry.
- The six internal per-product sections. Each renders a page saying what it will
  hold and which automation will fill it — a page rather than a dead link,
  because a panel that goes nowhere teaches visitors to stop clicking panels.
- Deep links into model-hub. The C4 and Events panels open the hub root; the
  per-product path shape is model-hub's to define, and inventing one here would
  produce a link that 404s the day it is deployed.
