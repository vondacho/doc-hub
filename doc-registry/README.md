# doc-registry

The **product registry** of the living documentation hub — the small,
hand-written half that everything else hangs off. A product exists in this hub
once it has an entry here: a name the business uses, a team that answers for it,
a repository its documentation is generated from. Everything `doc-portal` shows
*after* that is produced by automation and written back onto the same entry.

A [Strapi 5](https://strapi.io/) CMS, scaffolded on the same model as
`api-hub/api-registry`: TypeScript, the same `config/*.ts` shape, the same
selective-copy Dockerfile, the same secret handling in the chart. It is the
address `doc-portal` already carries as `REGISTRY_URL`.

It persists to **`doc-registry-db`**, a PostgreSQL instance with a chart of its
own, and holds no volume itself. That split is the point: the CMS is redeployed
on every image change and the data is not.

## What is modelled

**`Product`** — one collection type, `/api/products`. The fields are exactly the
ones `doc-portal/src/lib/products.ts` renders, so the portal can be pointed at
this API without changing a page:

| Field | Type | Notes |
|---|---|---|
| `slug` | uid | Generated from `name`, `^[a-z0-9]+(-[a-z0-9]+)*$`. The product's address in the portal, and it never changes |
| `name` | string | Unique. As the business says it |
| `summary` | text | 240 characters — it is what the catalog card shows |
| `domain` | string | The first thing anyone searches by |
| `owner` | string | The team, not a person. A person's name ages badly |
| `contact` | email | A team mailbox, for the same reason |
| `lifecycle` | enum | `incubating` · `active` · `maintained` · `sunset` |
| `version` | string | Semver, `major.minor.patch` |
| `registered` | date | |
| `repository` | string | Full URL |
| `tags` | json | Free vocabulary, and the cheapest half of the portal's search |
| `metrics` | component | `registry.metrics`, below |

**`registry.metrics`** — a Strapi component rather than eleven more columns on
the product, because the two halves have different authors. Everything in it is
written by a pipeline and nothing in it is typed by a human: documentation age
from the docs build, contract count and score from api-hub, acceptance pass rate
from qa-hub, open incidents from observability, roadmap items from the tracker.
Keeping them in one nested object is what makes "who writes this?" visible in
the schema instead of in a comment.

`draftAndPublish` is **off**. A registry entry is registered or it is not; a
draft product is a product the portal cannot see and nobody asked for, and the
publication state would only add a step to every automated write.

## Boot behaviour

`src/index.ts` does two things before the server listens, both switchable:

- **`SEED_PRODUCTS`** — loads the sixteen placeholder products from
  `src/seed/products.ts` (copied from the portal's array) into an **empty**
  collection. Empty is the whole guard, and deliberately the only one: once
  anybody has registered, edited or deleted a product the collection is not
  empty and this never runs again, so a restart cannot resurrect an entry
  somebody removed. Wipe `doc-registry-db`'s volume and the seed comes back —
  which is honest, because that is a new registry, not the old one.
- **`PUBLIC_READ`** — grants the public role `find` and `findOne` on
  `api::product.product`. `doc-portal` is server-rendered and fetches the
  catalogue on every request; an API token for data the portal makes public the
  moment it renders it would be a Secret to mint, carry and rotate for nothing.
  Reads are opened, writes are not — registration still goes through an
  authenticated call. Additive and idempotent, so it never re-enables something
  an administrator turned off... which is why it can be switched off entirely.

## Configuration

| Variable | Default | |
|---|---|---|
| `HOST` / `PORT` | `0.0.0.0` / `1337` | |
| `URL` | — | Public origin as the browser sees it. Behind an ingress the admin panel calls back to this, so leaving it empty breaks the UI |
| `DATABASE_CLIENT` | `sqlite` | `sqlite`, `postgres` or `mysql` — see `config/database.ts`. The chart sets `postgres` |
| `DATABASE_FILENAME` | `.tmp/data.db` | sqlite only, relative to the app root. Local development only |
| `DATABASE_HOST` … `DATABASE_PASSWORD` | — | postgres/mysql. The chart points these at `doc-registry-db` and reads the password from that release's Secret |
| `SEED_PRODUCTS` | unset | `true` to seed an empty collection on boot |
| `PUBLIC_READ` | `true` | `false` leaves the public role untouched |
| `APP_KEYS`, `API_TOKEN_SALT`, `ADMIN_JWT_SECRET`, `TRANSFER_TOKEN_SALT`, `JWT_SECRET`, `ENCRYPTION_KEY` | — | Required. The chart generates them once and preserves them across upgrades |

## Develop

```sh
npm install
npm run develop    # http://localhost:1337/admin, autoReload on
npm run build      # dist/ (server) + dist/build (admin panel)
npm start          # serve the build
```

`.env.example` is the starting point for `.env`, and defaults to **SQLite** —
locally the file in `.tmp/` is exactly what you want, and it is the one place
that connector is still used. The cluster runs on PostgreSQL. The first visit to
`/admin` asks for the initial administrator; that account lives in the database,
not in configuration.

To develop against PostgreSQL instead, port-forward the deployed database and
switch the four variables in `.env`:

```sh
kubectl -n doc-hub port-forward svc/doc-registry-db 5432:5432
# DATABASE_CLIENT=postgres DATABASE_HOST=localhost DATABASE_USERNAME=strapi DATABASE_PASSWORD=strapi
```

## Container

```sh
docker build -t doc-registry .
docker run --rm -p 1337:1337 --env-file .env doc-registry
```

## Cluster

```sh
../helm/doc-registry-db/deploy.sh    # first — Strapi crash-loops without it
../helm/doc-registry/deploy.sh
```

Each builds its image, installs the release into `doc-hub`, restarts the pods
onto it and runs `helm test`. This release owns no volume, so an uninstall takes
nothing with it; see `helm/README.md` for where the data actually lives and what
is deliberately kept.

## What is not built

- **Nothing writes the metrics yet.** They are seeded with the portal's
  placeholder numbers and then sit still. The pipelines that will `PUT` them —
  the docs build, api-hub's scorer, qa-hub's campaigns, observability — are the
  next thing this component needs.
- **`doc-portal` still reads its own array.** Pointing it here is the change
  this component exists to make possible: `searchProducts`, `findProduct` and
  `paginate` become `async` and fetch `/api/products`, and nothing above them
  moves.
- **`/registration` still only validates.** It prints the payload it would POST;
  the POST is one call to this API plus whatever credential it is given.
