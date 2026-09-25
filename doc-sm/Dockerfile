# syntax=docker/dockerfile:1
#
# Multi-stage build for the doc-sm story mapping board, mirroring doc-portal.
#
# `astro build` with the @astrojs/node adapter in standalone mode emits a Node
# HTTP server at dist/server/entry.mjs plus the client assets under dist/client.
# Astro externalises its runtime dependencies rather than bundling them, so the
# production node_modules tree has to ship with the image.
#
# doc-sm carries React where doc-portal does not, and all three of react,
# react-dom and @astrojs/react are runtime dependencies rather than build-only
# ones: the built server entry imports the React renderer even though the board
# is `client:only` and the server therefore never renders a component with it.
# Only the @types/* packages and the check tooling are devDependencies, and
# those are what the second `npm ci` below drops.
#
# Both stages use /app as WORKDIR on purpose: the adapter enables filesystem
# sessions and bakes their absolute location — /app/node_modules/.astro/sessions
# — into the server bundle at build time, so the build and runtime working
# directories must line up.

# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /app

# Install against the lockfile alone first, so this layer stays cached until a
# dependency actually changes.
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

COPY astro.config.mjs tsconfig.json ./
COPY public ./public
COPY src ./src
RUN npm run build

# Re-resolve without devDependencies so only the runtime tree moves forward.
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --no-audit --no-fund

# ---------- runtime ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Run unprivileged; the chart's securityContext expects uid/gid 10001.
# 1000 is deliberately avoided — the stock node image already has "node" there.
RUN addgroup -g 10001 app \
 && adduser -u 10001 -G app -D -H -s /sbin/nologin app

# The same image also renders a .storymap file without a browser. See
# src/cli/render.ts:
#
#   docker run --rm -i <image> render --format svg < map.storymap > map.svg
#
# `render` is on PATH, so the node image's entrypoint runs it in place of the
# CMD, and the server's CMD, the chart and the compose file stay as they are.
# resvg rasters the PNG from system fonts, and Alpine has none. DejaVu is the
# sans-serif the picture's generic font stack resolves to.
RUN apk add --no-cache font-dejavu \
 && printf '#!/bin/sh\nexec node /app/dist/cli/render.mjs "$@"\n' > /usr/local/bin/render \
 && chmod 755 /usr/local/bin/render

COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /app/package.json ./package.json

USER app

# The standalone adapter reads HOST/PORT. 0.0.0.0 so the kubelet can reach the
# probes; both are overridable from the chart. 4322 rather than doc-portal's
# 4321, which leaves 4323 and 4324 for doc-em and doc-es.
ENV HOST=0.0.0.0 PORT=4322
EXPOSE 4322

CMD ["node", "./dist/server/entry.mjs"]
