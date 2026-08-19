#!/usr/bin/env bash
#
# Build, install and verify doc-registry-db on a local cluster.
#
#   ./helm/doc-registry-db/deploy.sh              # build, upgrade, wait, test
#   ./helm/doc-registry-db/deploy.sh --no-build   # skip the image build
#   ./helm/doc-registry-db/deploy.sh --no-test    # skip helm test
#
# Environment overrides:
#   NAMESPACE  (default doc-hub)
#   RELEASE    (default doc-registry-db)
#   IMAGE_TAG  (default dev — must match image.tag in values-local.yaml)
#
# Run this *before* helm/doc-registry/deploy.sh: Strapi migrates its schema on
# boot and crash-loops until the database answers.
#
# Unlike the two Deployments in this repo there is no rollout restart step. The
# workload is a StatefulSet whose pod is replaced by the update strategy, and
# the image tag is only half of what identifies it — a rebuilt database image
# under the same tag does not change the data, so there is nothing to force.
# Restart by hand when you do mean it:
#
#   kubectl rollout restart statefulset/doc-registry-db -n doc-hub

set -euo pipefail

NAMESPACE="${NAMESPACE:-doc-hub}"
RELEASE="${RELEASE:-doc-registry-db}"
IMAGE_TAG="${IMAGE_TAG:-dev}"

# Resolve paths from this script rather than the caller's cwd, so it runs from
# anywhere in the repo.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHART_DIR="$SCRIPT_DIR"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SOURCE_DIR="$REPO_ROOT/doc-registry-db"

BUILD=true
TEST=true
for arg in "$@"; do
  case "$arg" in
    --no-build) BUILD=false ;;
    --no-test)  TEST=false ;;
    -h|--help)  sed -n '2,26p' "${BASH_SOURCE[0]}" | sed 's/^#//'; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

# Rancher Desktop puts helm, kubectl, docker and nerdctl here and does not
# always add it to a non-login shell's PATH.
export PATH="$HOME/.rd/bin:$PATH"

for tool in helm kubectl; do
  command -v "$tool" >/dev/null || { echo "$tool not found on PATH" >&2; exit 1; }
done

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

if [ "$BUILD" = true ]; then
  # nerdctl build fails with "no buildkit host is available" when Rancher
  # Desktop runs moby, and `docker build` cannot reach the k8s.io containerd
  # namespace when it runs containerd. Pick from the configured engine rather
  # than guessing.
  ENGINE_CONF="$HOME/Library/Preferences/rancher-desktop/settings.json"
  if [ -f "$ENGINE_CONF" ] && grep -q '"name":"containerd"' "$ENGINE_CONF"; then
    BUILD_CMD=(nerdctl --namespace k8s.io build)
  else
    BUILD_CMD=(docker build)
  fi

  command -v "${BUILD_CMD[0]}" >/dev/null || {
    echo "${BUILD_CMD[0]} not found on PATH" >&2; exit 1;
  }

  step "Building ${RELEASE}:${IMAGE_TAG} with ${BUILD_CMD[0]}"
  "${BUILD_CMD[@]}" -t "${RELEASE}:${IMAGE_TAG}" "$SOURCE_DIR"
fi

step "Installing release '$RELEASE' into namespace '$NAMESPACE'"
helm upgrade --install "$RELEASE" "$CHART_DIR" \
  --namespace "$NAMESPACE" --create-namespace \
  -f "$CHART_DIR/values-local.yaml"

step "Waiting for the rollout"
kubectl rollout status "statefulset/$RELEASE" -n "$NAMESPACE" --timeout=300s

step "Pods"
kubectl get pods -n "$NAMESPACE" -l "app.kubernetes.io/name=$RELEASE" \
  -o custom-columns='NAME:.metadata.name,DELETING:.metadata.deletionTimestamp,IMAGEID:.status.containerStatuses[0].imageID'

if [ "$TEST" = true ]; then
  step "Running helm test"
  helm test "$RELEASE" --namespace "$NAMESPACE"
fi

step "Done"
helm status "$RELEASE" --namespace "$NAMESPACE" | sed -n '/NOTES:/,$p'
