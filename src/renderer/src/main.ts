// Copied from Ship Editor (src/renderer/src/main.ts); may drift, see docs/PLAN.md §2.
import { mount } from 'svelte'
import App from './App.svelte'
import './styles.css'

mount(App, { target: document.getElementById('app')! })
