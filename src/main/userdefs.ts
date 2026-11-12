// Copied from Ship Editor (src/main/userdefs.ts); may drift, see docs/PLAN.md §2.
/**
 * User definition files: <user data>/definitions/*.json, applied on top of the built-in
 * definitions (see shared/defs). Read-only; the folder is created by the user.
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseLooseObject } from '../shared/loosejson'
import { registerDefs, type DefsPatch } from '../shared/defs'
import type { UserDefinitions } from '../shared/api'

export function loadUserDefs(dir: string): UserDefinitions {
  const out: UserDefinitions = { dir, files: [], patches: [] }
  let names: string[] = []
  try { names = fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.json')).sort() } catch { return out }
  for (const name of names) {
    try {
      const value = parseLooseObject(fs.readFileSync(path.join(dir, name), 'utf8')).value as DefsPatch
      out.patches.push(value)
      out.files.push({ name, gameVersion: String(value.gameVersion ?? '') })
    } catch (e) {
      out.files.push({ name, gameVersion: '', error: (e as Error).message })
    }
  }
  const errors = registerDefs(out.patches)
  out.files.filter((f) => !f.error).forEach((f, i) => { if (errors[i]) f.error = errors[i]! })
  return out
}
