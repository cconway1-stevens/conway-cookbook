import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.PAGES_ORIGIN,
  base: process.env.PAGES_BASE || '/',
});
