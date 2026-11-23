import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import rehypeSections from './src/lib/rehype-sections.mjs';

export default defineConfig({
  site: process.env.PAGES_ORIGIN,
  base: process.env.PAGES_BASE || '/',
  compressHTML: true,
  markdown: { processor: unified({ rehypePlugins: [rehypeSections] }) },
});
