# Helm charts

Deployment charts for the doc-hub components. Following the same
monorepo-of-standalone-modules convention as dev-hub, api-hub and model-hub,
**each component gets its own independent chart** — there is no umbrella chart.

| Chart | Component | Status |
|-------|-----------|--------|
| `doc-portal/` | `doc-portal` Astro frontend | present |
| `doc-registry/` | `doc-registry` Strapi CMS and its admin UI | present |
| `doc-registry-db/` | `doc-registry-db` PostgreSQL instance | present |
| `doc-sm/` | `doc-sm` story mapping board | present |

All four charts are **built from this repo**: `values-local.yaml` pins
`tag: dev` with `pullPolicy: Never`, so the image has to be built into the
node's image store first — there is nothing to pull.

The ingress is enabled **by default** on the three web components. A browser
frontend nobody can open is not a useful default, and `*.localhost` costs
nothing on a local cluster. The database has no ingress at all.

The registry is **two charts, not one**, for the same reason the repo is a
monorepo of standalone modules: the CMS is redeployed on every image change and
the database is not. `doc-registry` reads the database password straight from
the Secret the `doc-registry-db` release owns, so the credential exists in one
place. **Install `doc-registry-db` first** — Strapi migrates its schema on boot
and crash-loops until the database answers.

> **The registry runs on PostgreSQL, not SQLite or MongoDB.** Strapi 5 reaches
> its database through Knex and ships connectors for `postgres`, `mysql` and
> `sqlite` only — see the `connections` map in
> `doc-registry/config/database.ts`. Mongoose support was dropped after Strapi
> v3. SQLite is still what `npm run develop` uses locally, and is deliberately
> unreachable from the chart: a SQLite file in a pod with no volume is a
> registry that silently empties itself on every restart.

**Exactly one volume exists in this repo**, and it belongs to
`doc-registry-db`. The portal is stateless because it renders a compiled-in
array; the CMS is stateless because everything it holds is in the database
behind it. That is what lets both take a plain rolling update with
`replicaCount` free to move.

**Dependencies between releases.** `doc-registry` needs `doc-registry-db` and
will crash-loop without it. `doc-portal` now reads `doc-registry` over its
content API, but only at request time and only for the catalog: it starts,
serves its home page and passes its probes with the registry down, and says so
on the pages that need it. Install order is therefore db → registry → portal,
and only the first arrow is a hard one.

## Prerequisites

- A local Kubernetes cluster. This machine's kubeconfig has `rancher-desktop`
  as the current context.
- `helm` v3+ and `kubectl` — Rancher Desktop ships both at `~/.rd/bin/`.
- A container build tool (`docker`, or `nerdctl` when Rancher Desktop runs
  containerd — see *Build engine gotcha*).

## Deploy

```bash
./helm/doc-registry-db/deploy.sh    # first: the registry crash-loops without it
./helm/doc-registry/deploy.sh
./helm/doc-portal/deploy.sh         # reads the registry, but starts without it
./helm/doc-sm/deploy.sh             # depends on nothing; deploy it whenever
```

That is the whole thing, and all four scripts are the same script: each builds
its image with whichever engine Rancher Desktop is configured for, installs the
release into the `doc-hub` namespace (creating it), restarts the pods onto the
rebuilt image, waits for the rollout, prints the running pods with their image
IDs, and runs `helm test`.

The database script skips the restart step. Its workload is a StatefulSet whose
pod the update strategy replaces anyway, and a rebuilt database image under the
same tag does not change the data — so there is nothing to force.

| Flag | Effect |
|------|--------|
| `--no-build` | Skip the image build — chart-only changes |
| `--no-test` | Skip `helm test` |

| Variable | Default |
|----------|---------|
| `NAMESPACE` | `doc-hub` |
| `RELEASE` | the chart name — `doc-portal`, `doc-registry` or `doc-registry-db` |
| `IMAGE_TAG` | `dev` (must match `image.tag` in `values-local.yaml`) |

By hand, the same three steps:

```bash
# 1. build into the store the kubelet reads
cd doc-portal && docker build -t doc-portal:dev .

# 2. reconcile the release
helm upgrade --install doc-portal helm/doc-portal \
  --namespace doc-hub --create-namespace \
  -f helm/doc-portal/values-local.yaml

# 3. force the pods onto the new image
kubectl rollout restart deployment/doc-portal -n doc-hub
kubectl rollout status  deployment/doc-portal -n doc-hub --timeout=300s
```

**Why step 3 is not optional.** `values-local.yaml` pins `tag: dev` with
`pullPolicy: Never`. Rebuilding produces a new image under the *same* tag, so
the rendered Deployment is byte-identical to the one already applied —
Kubernetes sees no change and leaves the old pods running, while `helm upgrade`
still reports `STATUS: deployed` and bumps the revision. The `checksum/config`
annotation covers *ConfigMap* changes only; it does nothing for an image
rebuilt under a fixed tag.

Confirm the pod actually picked the image up rather than trusting the rollout,
and print the `DELETING` column instead of filtering on `status.phase` — a
terminating pod still reports `Running`, so for a few seconds it can still be
`items[0]` and report the *old* digest:

```bash
kubectl get pods -n doc-hub -l app.kubernetes.io/name=doc-portal \
  -o custom-columns='NAME:.metadata.name,DELETING:.metadata.deletionTimestamp,IMAGEID:.status.containerStatuses[0].imageID'
docker inspect doc-portal:dev --format '{{.Id}}'
```

## Verify

```bash
helm test doc-portal -n doc-hub
open http://doc-portal.localhost
```

Rancher Desktop runs Traefik as the default IngressClass and `*.localhost`
resolves to 127.0.0.1, so the portal is reachable from the host with no
port-forward. With `ingress.enabled=false`:

```bash
kubectl -n doc-hub port-forward svc/doc-portal 4321:4321
```

```bash
helm test doc-sm -n doc-hub
open http://doc-sm.localhost
```

`doc-sm`'s test fetches `/healthz`, `/` and `/dsl`, and that is the whole list —
not a thinner test than the portal's eight, but a component with less to check.
It calls no registry and owns no database, so there is no integration a request
could prove. Note what a 200 on `/` does *not* prove: the board is `client:only`,
so the server sends an empty island and every card, drag and export happens in
the browser. The test claims the route and the assets are served, and nothing
more.

`helm test` fetches one URL per thing that can independently fail — `/healthz`,
`/`, `/catalog`, `/catalog?q=data`, a product view, one of its section pages,
`/landscape` and `/registration`. A bare health check passes while every
rendered page is broken; `/landscape` is the page that reads the outbound
addresses from the ConfigMap, so it is what proves `envFrom` is wired; and the
two product URLs prove the catalog can actually open what it lists.

The registry, the same way:

```bash
helm test doc-registry -n doc-hub
open http://doc-registry.localhost/admin           # the CMS
open http://doc-registry.localhost/api/products    # what the portal will read
```

Its three test URLs are `/_health`, `/admin` and
`/api/products?populate=metrics`. The health endpoint answers before the admin
bundle is served, so the UI is checked separately — it is what a browser
actually loads. The content API is checked third because it is three
independent things at once: the route, the public-role grant that
`src/index.ts` makes on boot, and the metrics component populated behind it. A
403 there means the grant did not happen; an empty payload means the schema
migrated but the seed did not run.

The first visit to `/admin` asks for the initial administrator. That account
lives in the database, so it survives a redeploy but not a wipe of
`doc-registry-db`'s volume.

The database, which has no HTTP surface to check:

```bash
helm test doc-registry-db -n doc-hub
kubectl -n doc-hub exec -it statefulset/doc-registry-db -- psql -U strapi -d strapi
```

Its test asserts more than reachability — it authenticates, and then checks that
`pg_trgm` is installed, which is only true if the hook in
`doc-registry-db/initdb/` actually ran.

## Remove

```bash
./helm/doc-portal/uninstall.sh                   # the release
./helm/doc-registry/uninstall.sh                 # the release, data untouched
./helm/doc-registry-db/uninstall.sh              # the release, data kept
./helm/doc-sm/uninstall.sh                       # the release; it has no data

./helm/doc-registry/uninstall.sh --secret        # and its Strapi secrets
./helm/doc-registry-db/uninstall.sh --data       # and every registered product
./helm/doc-portal/uninstall.sh --namespace       # and the namespace, if empty
```

`doc-portal` and `doc-registry` are both stateless, so uninstalling either takes
nothing with it — reinstall and the registry comes back with everything in it.
Two things are kept on purpose:

- **`doc-registry-db`'s volume.** Kubernetes never deletes a claim created from
  a StatefulSet's `volumeClaimTemplates`, so the products outlive the release
  whether or not anyone meant them to.
- **`doc-registry`'s Secret**, which carries `helm.sh/resource-policy: keep`.
  Its `ENCRYPTION_KEY` is the only thing that can read the encrypted columns in
  that database back, so it must not be easier to destroy than the data it
  decrypts.

`--data` and `--secret` are the deliberate opposites, and both prompt before
they act. They only make sense together.

## Build engine gotcha

`nerdctl build` fails with `no buildkit host is available` when Rancher Desktop
is configured for **moby** rather than containerd. `deploy.sh` reads the setting
and picks the right command; to check by hand:

```bash
grep -o '"name":"[a-z]*"' ~/Library/Preferences/rancher-desktop/settings.json
```

`moby` means `docker build`; `containerd` means `nerdctl --namespace k8s.io
build`. This machine currently reports `moby`.

## Notes on the doc-portal chart

- **The portal is entirely server-rendered** (`output: 'server'` +
  `@astrojs/node` in standalone mode). Unlike dev-hub's `dev-portal` there is no
  Starlight section and nothing is prerendered: the catalog is a query, and its
  results and the outbound addresses are both resolved per request.
- **The product data is no longer compiled in.** `doc-portal/src/lib/products.ts`
  used to hold a placeholder array baked into the image, so changing a product
  needed a rebuild. It now reads `doc-registry` over its content API on every
  request: a product changes when somebody edits it in the CMS, with no
  redeploy of anything.
- **That makes the portal's catalog depend on the registry at request time**,
  which the rest of the portal deliberately does not. An unreachable registry
  renders `/catalog` as an outage panel with a **503**, and a product view as a
  503 rather than a 404 — "this product does not exist" and "I could not find
  out whether it exists" are different claims. `/`, `/landscape`,
  `/registration` and `/healthz` do not touch it, which is why a CMS blip does
  not get the portal restarted by its own kubelet.
- **Eight config knobs**, all rendered into a ConfigMap and injected with
  `envFrom`. `src/lib/links.ts` reads each through `process.env` at call time
  and falls back to the same default the chart ships, so an unset value and the
  default look identical in the page — override one to something obviously
  wrong if you ever need to prove the wiring works.

  | Key | Points at |
  |-----|-----------|
  | `MODEL_C4_URL` | model-hub's LikeC4 site — `/landscape` and every product's C4 panel |
  | `MODEL_EVENTCATALOG_URL` | model-hub's EventCatalog site — `/landscape` and every product's Events panel |
  | `MODEL_PORTAL_URL` | model-hub's portal — `/landscape` and the footer |
  | `API_PORTAL_URL` | api-hub's portal — the footer |
  | `DEV_PORTAL_URL` | dev-hub's portal — the footer |
  | `QA_PORTAL_URL` | qa-hub's portal — the campaigns section |
  | `REGISTRY_URL` | the CMS as the *browser* sees it — printed on `/registration`, and the admin-UI link |
  | `REGISTRY_API_URL` | the CMS as the *portal* sees it — `http://doc-registry:1337`, the catalog's source |

- **`REGISTRY_API_URL` is the one exception to the rule below**, and the reason
  there are two entries for one CMS. The catalog is fetched during server-side
  rendering, so that request is resolved by the portal's own process: the
  Service name is right, and the ingress host would leave the cluster and come
  back in to reach something one DNS name away — and would break outright with
  `ingress.enabled=false`, which the Service name does not care about.
- **Everything else is a browser-facing link, not an in-cluster call.** Each
  points at a Traefik ingress host because the *visitor's browser* resolves it.
  `http://arch-c4:8080` would be wrong here even though the portal is
  server-rendered — and it would also be wrong because those releases live in
  the `arch-hub`, `api-hub` and `qa-hub` namespaces, not this one.
- **`/go/*` exists for the links that are quoted rather than rendered** — a
  bookmark, a printed URL, or any page that later becomes prerendered. It reads
  the environment per request and 302s. The portal's own pages skip the hop.
- Probes hit `/healthz`, served by `doc-portal/src/pages/healthz.ts`.
- `readOnlyRootFilesystem: true` with `emptyDir`s at `/tmp` and
  `/app/node_modules/.astro`. `@astrojs/node` bakes that session path into the
  bundle at build time and creates it lazily. Nothing in the portal uses
  `Astro.session` today, so the mount is insurance: without it, the first page
  that ever does would fail in the cluster and nowhere else.
- The pod runs as **uid/gid 10001**, matching the `app` user in the Dockerfile.
  1000 is deliberately avoided — the `node` base image already uses it.
- The ingress is routed at `/`, not per-section: one server owns the home page,
  `/catalog` and every product view under it, `/landscape`, `/registration`, the
  `/go/*` redirects and the hashed assets under `/_astro/*`.

## Notes on the doc-registry chart

- **The CMS owns no volume.** Everything that has to outlive a pod is in
  `doc-registry-db`, which is what turns the `Recreate` strategy the old
  ReadWriteOnce claim forced into an ordinary rolling update.
- **`maxSurge: 0`, though.** Losing the volume does not make two Strapi pods
  interchangeable: **Strapi migrates the schema at boot**, so a surging update
  has two versions migrating the same database at once. That is not theoretical
  — it produced `duplicate key value violates unique constraint
  pg_type_typname_nsp_index` on the first boot against an empty database, and
  the pod recovered only because the second attempt found the schema already
  there. Draining first costs a few seconds and removes the race. Raising
  `replicaCount` reintroduces it, so anything above 1 needs a migration story.
- **The consequence is stated rather than hidden**: `/app/public/uploads` is an
  `emptyDir`, so media uploaded through the admin UI does not survive the pod,
  while the rows in the database that reference it do. A product entry is text
  and needs no attachment; anything dragged into the Media Library is scratch
  space. Configure a remote upload provider in
  `doc-registry/config/plugins.ts` the day that stops being true — that keeps
  the release stateless, which re-adding a claim would not.
- **`database.host` and `database.existingSecret` are both `required`.** The
  chart refuses to render without them rather than falling back to something
  local: there is no volume to fall back onto, so a registry with no database is
  one that loses its contents at the first restart.
- **Secrets are generated once and preserved.** `helm upgrade` reads the six
  Strapi secrets back out of the live Secret rather than regenerating them.
  Rotating `ENCRYPTION_KEY` makes already-stored encrypted fields permanently
  unreadable; rotating `APP_KEYS` or `ADMIN_JWT_SECRET` signs every admin out.
  Pin any of them in values, or point `strapi.existingSecret` at your own.
- `deploy.sh` waits 600s where the portal's waits 300s: the first boot migrates
  the whole schema against an empty database and seeds it before the server ever
  listens.
- **`app.url` must match the ingress host.** Strapi builds the absolute URLs it
  hands the admin panel from it; leave it empty behind an ingress and the UI
  calls back to the in-cluster address, which no browser resolves. The chart
  derives it from the first ingress host when it is not set.
- **`SEED_PRODUCTS` and `PUBLIC_READ` are read by `src/index.ts` on boot**, not
  by Strapi. The seed only ever fills an *empty* collection, so it is safe to
  leave on; the grant gives the public role `find`/`findOne` on
  `/api/products` so the portal can read the catalogue without an API token.
  Writes stay closed.
- **The ingress is routed at `/`, not `/admin`.** The admin panel loads its
  bundle from `/admin` but calls the content API at `/api` and the upload
  endpoints at `/uploads`; a narrower prefix breaks the UI, and `/api` is what
  the portal will read.
- `readOnlyRootFilesystem: true`, with `emptyDir`s at `/tmp` (Strapi buffers
  multipart uploads through it) and `/home/app` (the CLI creates a config store
  under `$HOME` while loading its commands, and logs `Failed to load command` if
  it cannot).
- The pod runs as **uid/gid 10001**, matching the `app` user in the Dockerfile —
  same reason as the portal, and `fsGroup` is what makes the volume writable.
- The startup probe allows **five minutes**. First boot migrates the whole
  schema against an empty database and seeds it before the server ever listens.

## Notes on the doc-registry-db chart

- **A StatefulSet, not a Deployment.** Exactly one PostgreSQL process may open
  the data directory, and a Deployment's rolling update would start a second one
  against it.
- **`PGDATA` points at a *subdirectory* of the volume mount.** `initdb` refuses
  a directory it does not own at `0700`/`0750`, which is exactly what a
  PersistentVolume mounted with an `fsGroup` looks like; letting `initdb` create
  the subdirectory itself sidesteps the check.
- **Probes exec `pg_isready`** rather than opening a TCP socket — a TCP check
  passes while the cluster is still recovering, and would let Strapi connect too
  early and crash-loop against a database that is nearly up.
- **The password is generated on first install and read back on every upgrade.**
  Regenerating it would leave the CMS holding a stale credential against a
  running cluster that kept the old one. `values-local.yaml` pins it to `strapi`
  so a local `psql` shell has a known credential; never do that anywhere else.
- **`terminationGracePeriodSeconds: 60`.** PostgreSQL flushes its buffers on
  SIGINT, and the default 30s can truncate that on a cold cache and force
  recovery on the next boot.
- The volume claim comes from `volumeClaimTemplates`, so **Kubernetes never
  deletes it** — not on uninstall, not on a chart change. `uninstall.sh --data`
  is the only thing in this repo that does, and it prompts first.
- No ingress: nothing outside the cluster has any business opening a database
  port.

## Notes on the doc-sm chart

`doc-sm` is the story mapping board: activities, steps and stories on one board,
read from and written to a `.storymap` file.

**It is the only release here that depends on nothing.** No database, no volume,
no registry call, no Secret — and so no install order. Deploy it before or after
anything else; nothing waits for it and it waits for nothing. Its ConfigMap
carries two entries against `doc-portal`'s eight, and both are browser-facing
links rather than in-cluster calls, because this component makes no requests at
all.

**Nothing it holds can be lost by deleting a pod**, because it holds nothing. A
story map lives in the file the visitor exports; work that has not been exported
lives in their browser tab, which is what the board's unload warning is for. That
is the same position the repo already takes on C4 and events — the model belongs
in a repository, not in the registry.

**Port 4322**, not the portal's 4321, which leaves 4323 and 4324 for the sibling
boards `doc-em` and `doc-es`.

**One hydrated component.** The board page is prerendered and loads a React
island; every other page is server-rendered HTML with no script. That is the
only client-side JavaScript in doc-hub, and it is argued at the top of
`doc-sm/src/components/board/StoryMapBoard.tsx`. The practical consequence for
this chart is that `helm test` can prove the route and the assets are served and
nothing further — see Verify above.

**The two `emptyDir`s are pure insurance here.** `readOnlyRootFilesystem: true`
is on, and `/tmp` plus `/app/node_modules/.astro` are mounted exactly as in
`doc-portal`, because the Astro node adapter bakes a session path in at build
time. doc-sm uses no sessions and writes nothing at run time; the mounts are
there so the day it does is not a deployment incident.

## Chart layout

All four charts have the same shape; the registry pair adds what stateful
components need, and `doc-sm` is `doc-portal` with a shorter ConfigMap.

```
doc-portal/                     doc-registry/                 doc-registry-db/
  Chart.yaml                      Chart.yaml                    Chart.yaml
  values.yaml                     values.yaml                   values.yaml                # defaults
  values-local.yaml               values-local.yaml             values-local.yaml          # local overrides
  deploy.sh                       deploy.sh                     deploy.sh                  # build + upgrade + test
  uninstall.sh                    uninstall.sh                  uninstall.sh               # + --secret / --data
  templates/                      templates/                    templates/
    _helpers.tpl                    _helpers.tpl                  _helpers.tpl
    configmap.yaml                  configmap.yaml                -                        # app config, injected with envFrom
    -                               secret.yaml                   secret.yaml              # generated once, kept
    deployment.yaml                 deployment.yaml               statefulset.yaml         # db's volumeClaimTemplate is the only storage here
    service.yaml                    service.yaml                  service.yaml
    serviceaccount.yaml             serviceaccount.yaml           serviceaccount.yaml
    ingress.yaml                    ingress.yaml                  -                        # nothing outside opens a database port
    NOTES.txt                       NOTES.txt                     NOTES.txt
    tests/test-connection.yaml      tests/test-connection.yaml    tests/test-connection.yaml
```

`doc-sm/` is not a fourth column above because it would repeat `doc-portal/`
line for line — same files, same templates, a shorter `configmap.yaml` and a
different port. Copy that column when reading it.

The three web releases are stateless, so `replicaCount` is free to move in all.
`doc-registry-db` is the opposite on both counts, and is the only place in this
repo where that is true.
