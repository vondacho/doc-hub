// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
	// Server-rendered, matching doc-portal — but see the `prerender` export in
	// src/pages/index.astro: the board itself asks the server for nothing and is
	// prerendered, which is a claim worth making structurally rather than in a
	// comment.
	output: 'server',
	adapter: node({ mode: 'standalone' }),

	// The first framework integration in doc-hub.
	//
	// doc-portal ships zero client-side JavaScript and argues the position in
	// src/components/catalog/SearchBar.astro: a search is a GET form because the
	// query belongs in the URL. That argument does not reach a story map. A board
	// is direct manipulation — pick a card up, put it somewhere else — and there
	// is no URL, no form and no round trip that expresses "this story moved from
	// R2 to MVP and above the one below it".
	//
	// So React is here for exactly one component, <StoryMapBoard client:only>.
	// Every other page in doc-sm is still server-rendered HTML with no script
	// attached, and the day a second island appears is the day to ask whether
	// this is still a documentation site.
	integrations: [react()],

	// Tailwind 4 is a Vite plugin, not an Astro integration.
	vite: { plugins: [tailwindcss()] },
});
