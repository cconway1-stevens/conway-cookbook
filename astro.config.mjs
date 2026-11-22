import { defineConfig } from 'astro/config';
import rehypeSections from './src/lib/rehype-sections.mjs';

export default defineConfig({
  site: process.env.PAGES_ORIGIN,
  base: process.env.PAGES_BASE || '/',
  markdown: { rehypePlugins: [rehypeSections] },
});
