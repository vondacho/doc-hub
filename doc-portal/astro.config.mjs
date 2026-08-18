// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Server-rendered, matching dev-hub's dev-portal.
  //
  // Two independent reasons here, and either alone would be enough:
  //
  //   1. The catalog is a *query*. /catalog reads `q` and `page` per request and
  //      will read them from a registry rather than from src/lib/products.ts as
  //      soon as one exists. A prerendered search page can only ever search a
  //      snapshot taken at build time.
  //   2. The addresses of the neighbouring hubs (api-hub, model-hub, qa-hub) are
  //      configuration. They differ per environment and have to be resolved when
  //      the page is served, not baked into the image.
  //
  // There is no Starlight section here, unlike dev-portal: this hub's prose is
  // per-product living documentation coming from the registry, not a handwritten
  // book. Add the integration the day a handwritten section actually exists.
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  // Tailwind 4 is a Vite plugin, not an Astro integration.
  vite: { plugins: [tailwindcss()] },
});
