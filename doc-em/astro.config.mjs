// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
	// Server-rendered, matching doc-portal — but see the `prerender` exports in
	// src/pages/dsl.astro and src/pages/404.astro: a page that asks the server
	// for nothing says so structurally rather than in a comment.
	//
	// The board page is not among them. It reads the registered products from
	// doc-registry on every request to fill its product picker, so its response
	// is not the same for every visitor and baking it at build time would hand
	// out a catalogue that goes stale the first time somebody registers a
	// product.
	output: 'server',
	adapter: node({ mode: 'standalone' }),

	// The first framework integration in doc-hub.
	//
	// doc-portal ships zero client-side JavaScript and argues the position in
	// src/components/catalog/SearchBar.astro: a search is a GET form because the
	// query belongs in the URL. That argument does not reach an example map. A
	// board is direct manipulation — pick a card up, put it somewhere else — and
	// there is no URL, no form and no round trip that expresses "this question is
	// really about the story, not about that rule".
	//
	// So React is here for exactly one component, <ExampleMapBoard client:only>.
	// Every other page in doc-em is still server-rendered HTML with no script
	// attached, and the day a second island appears is the day to ask whether
	// this is still a documentation site.
	integrations: [react()],

	// Tailwind 4 is a Vite plugin, not an Astro integration.
	vite: { plugins: [tailwindcss()] },
});
