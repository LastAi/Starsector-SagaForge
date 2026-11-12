// Copied from Ship Editor (electron.vite.config.ts); may drift, see docs/PLAN.md §2.
import { defineConfig } from 'electron-vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [svelte()]
  }
})
