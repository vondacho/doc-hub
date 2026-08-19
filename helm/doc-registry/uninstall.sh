#!/usr/bin/env bash
#
# Remove the doc-registry release.
#
#   ./helm/doc-registry/uninstall.sh                 # release only
#   ./helm/doc-registry/uninstall.sh --secret        # and its Strapi secrets
#   ./helm/doc-registry/uninstall.sh --namespace     # and the namespace with it
#
# Environment overrides:
#   NAMESPACE  (default doc-hub)
#   RELEASE    (default doc-registry)
#
# This release owns no volume: the registered products live in doc-registry-db,
# and uninstalling here does not touch them. Reinstall and the registry comes
# back with everything in it.
#
# The one thing left behind is the Secret, which carries
# helm.sh/resource-policy: keep. Its ENCRYPTION_KEY is the only thing that can
# read the encrypted columns in doc-registry-db back, so it must not be easier
# to destroy than the database it decrypts. --secret is the deliberate
# opposite, and only makes sense together with
# `./helm/doc-registry-db/uninstall.sh --data`.
#
# The namespace is left in place by default: it is cheap, and deleting it takes
# everything else in it — doc-portal and doc-registry-db included.

set -euo pipefail

NAMESPACE="${NAMESPACE:-doc-hub}"
RELEASE="${RELEASE:-doc-registry}"
DROP_NAMESPACE=false
DROP_SECRET=false

for arg in "$@"; do
  case "$arg" in
    --namespace) DROP_NAMESPACE=true ;;
    --secret)    DROP_SECRET=true ;;
    -h|--help)   sed -n '2,26p' "${BASH_SOURCE[0]}" | sed 's/^#//'; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

export PATH="$HOME/.rd/bin:$PATH"

helm uninstall "$RELEASE" --namespace "$NAMESPACE"

if [ "$DROP_SECRET" = true ]; then
  echo
  echo "ENCRYPTION_KEY in secret/${RELEASE} is what reads the encrypted columns"
  echo "in doc-registry-db back. Deleting it does not empty the database — it"
  echo "makes part of it permanently unreadable."
  read -r -p "Delete secret/${RELEASE}? [y/N] " reply
  case "$reply" in
    y|Y|yes|YES) kubectl delete secret "${RELEASE}" -n "$NAMESPACE" --ignore-not-found ;;
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
