# Helm charts

Deployment charts for the doc-hub components. Following the same
monorepo-of-standalone-modules convention as dev-hub, api-hub and model-hub,
**each component gets its own independent chart** — there is no umbrella chart.

| Chart | Component | Status |
|-------|-----------|--------|
| `doc-portal/` | `doc-portal` Astro frontend | present |

The chart is **built from this repo**: `values-local.yaml` pins `tag: dev` with
`pullPolicy: Never`, so the image has to be built into the node's image store
first — there is nothing to pull.

The ingress is enabled **by default**. A browser frontend nobody can open is not
a useful default, and `*.localhost` costs nothing on a local cluster.

## Prerequisites

- A local Kubernetes cluster. This machine's kubeconfig has `rancher-desktop`
  as the current context.
- `helm` v3+ and `kubectl` — Rancher Desktop ships both at `~/.rd/bin/`.
- A container build tool (`docker`, or `nerdctl` when Rancher Desktop runs
  containerd — see *Build engine gotcha*).

## Deploy

```bash
./helm/doc-portal/deploy.sh
```

That is the whole thing: it builds the image with whichever engine Rancher
Desktop is configured for, installs the release into the `doc-hub` namespace
(creating it), restarts the pods onto the rebuilt image, waits for the rollout,
prints the running pods with their image IDs, and runs `helm test`.

| Flag | Effect |
|------|--------|
| `--no-build` | Skip the image build — chart-only changes |
| `--no-test` | Skip `helm test` |

| Variable | Default |
|----------|---------|
| `NAMESPACE` | `doc-hub` |
| `RELEASE` | `doc-portal` |
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

`helm test` fetches one URL per thing that can independently fail — `/healthz`,
`/`, `/catalog`, `/catalog?q=data`, a product view, one of its section pages,
`/landscape` and `/registration`. A bare health check passes while every
rendered page is broken; `/landscape` is the page that reads the outbound
addresses from the ConfigMap, so it is what proves `envFrom` is wired; and the
two product URLs prove the catalog can actually open what it lists.

## Remove

```bash
./helm/doc-portal/uninstall.sh              # the release
./helm/doc-portal/uninstall.sh --namespace  # and the namespace, if empty
```

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
- **The product data is not configuration.** `doc-portal/src/lib/products.ts`
  holds the placeholder registry and is compiled into the image, so changing a
  product needs a rebuild rather than a restart. Only the addresses below are
  configuration, and that stops being true the day the portal reads a real
  registry over HTTP.
- **Seven config knobs**, all rendered into a ConfigMap and injected with
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
  | `REGISTRY_URL` | the CMS behind `/registration`; printed, not yet called |

- **They are browser-facing links, not in-cluster calls.** Each points at a
  Traefik ingress host because the *visitor's browser* resolves it.
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

## Chart layout

```
doc-portal/
  Chart.yaml
  values.yaml                     # defaults
  values-local.yaml               # local-cluster overrides
  deploy.sh                       # build + upgrade + restart + test
  uninstall.sh
  templates/
    _helpers.tpl
    configmap.yaml                # app config, injected with envFrom
    deployment.yaml
    service.yaml
    serviceaccount.yaml
    ingress.yaml
    NOTES.txt
    tests/test-connection.yaml
```

No storage: the release is stateless, so `replicaCount` is free to move.
