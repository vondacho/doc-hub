#!/usr/bin/env bash
#
# Remove the doc-registry-db release.
#
#   ./helm/doc-registry-db/uninstall.sh              # release only, data kept
#   ./helm/doc-registry-db/uninstall.sh --data       # and the data, after confirming
#   ./helm/doc-registry-db/uninstall.sh --namespace  # and the namespace, if empty
#
# Environment overrides:
#   NAMESPACE  (default doc-hub)
#   RELEASE    (default doc-registry-db)
#
# The volume outlives the release either way: Kubernetes never deletes a claim
# created from a StatefulSet's volumeClaimTemplates, and the Secret carries
# helm.sh/resource-policy: keep so the generated password survives with it. A
# reinstall therefore picks the registry up exactly where it was.
#
# --data is the deliberate opposite. It drops every registered product, and the
# password with it. There is no undo, and doc-registry's own Secret — whose
# ENCRYPTION_KEY is the only thing that can read the encrypted columns back —
# becomes meaningless at the same moment.

set -euo pipefail

NAMESPACE="${NAMESPACE:-doc-hub}"
RELEASE="${RELEASE:-doc-registry-db}"
DROP_NAMESPACE=false
DROP_DATA=false

for arg in "$@"; do
  case "$arg" in
    --namespace) DROP_NAMESPACE=true ;;
    --data)      DROP_DATA=true ;;
    -h|--help)   sed -n '2,23p' "${BASH_SOURCE[0]}" | sed 's/^#//'; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

export PATH="$HOME/.rd/bin:$PATH"

helm uninstall "$RELEASE" --namespace "$NAMESPACE"

if [ "$DROP_DATA" = true ]; then
  echo
  echo "This deletes every registered product in $RELEASE."
  read -r -p "Delete pvc/data-${RELEASE}-0 and secret/${RELEASE}? [y/N] " reply
  case "$reply" in
    y|Y|yes|YES)
      # Named by the StatefulSet: <volumeClaimTemplate>-<statefulset>-<ordinal>.
      kubectl delete pvc "data-${RELEASE}-0" -n "$NAMESPACE" --ignore-not-found
      kubectl delete secret "${RELEASE}" -n "$NAMESPACE" --ignore-not-found
      ;;
    *) echo "left in place." ;;
  esac
fi

if [ "$DROP_NAMESPACE" = true ]; then
  remaining=$(helm list --namespace "$NAMESPACE" --short | wc -l | tr -d ' ')
  if [ "$remaining" != "0" ]; then
    echo "refusing to delete namespace '$NAMESPACE': $remaining other release(s) still installed" >&2
    exit 1
  fi
  kubectl delete namespace "$NAMESPACE"
fi
