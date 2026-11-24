// Copied from Ship Editor (src/renderer/src/main.ts); may drift, see docs/PLAN.md §2.
import { mount } from 'svelte'
import App from './App.svelte'
import TokenWindowApp from './tokens/TokenWindowApp.svelte'
import './styles.css'

// #67 U44: the token window is the same page with #tokens
mount(location.hash === '#tokens' ? TokenWindowApp : App, { target: document.getElementById('app')! })
