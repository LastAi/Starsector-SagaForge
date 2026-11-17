/**
 * Translations (Phase 8c, R31): reading the texts of an installed Saga Forge mod (read only) and
 * the files of a new translation mod. No Electron imports.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { SourceInfo } from '../shared/api'
import { parseCsvRecords } from '../shared/csvedit'
import { parseLooseObject } from '../shared/loosejson'
import { translationEntries, translationCsv, TRANSLATION_DIR, type RuntimeText } from '../shared/translate'

const CONTENT = 'data/config/sagaforge/content.csv'
const SKIP = new Set(['profiles', 'translation', 'pool'])

/** The runtime files of one mod (its own rows in its content.csv), read from its folder. */
export function modTexts(src: SourceInfo): RuntimeText[] {
  const f = path.join(src.dir, ...CONTENT.split('/'))
  if (!fs.existsSync(f)) return []
  const recs = parseCsvRecords(fs.readFileSync(f, 'utf8'))
  const head = recs[0]?.fields.map((x) => x.trim()) ?? []
  const col = (r: string[], k: string) => (r[head.indexOf(k)] ?? '').trim()
  const out: RuntimeText[] = []
  for (const r of recs.slice(1)) {
    const id = col(r.fields, 'id'), type = col(r.fields, 'type'), rel = col(r.fields, 'path'), mod = col(r.fields, 'mod')
    if (!id || id.startsWith('#') || mod !== src.id || SKIP.has(type)) continue
    try {
      const json = parseLooseObject(fs.readFileSync(path.join(src.dir, ...rel.split('/')), 'utf8')).value
      out.push({ id, type, json })
    } catch { /* a missing or broken file has nothing to translate */ }
  }
  return out
}

/** Mods a translation can be made for: those with texts to translate. */
export function translatableMods(sources: SourceInfo[]): { id: string; name: string; version: string; texts: number; dialog: boolean }[] {
  const out: { id: string; name: string; version: string; texts: number; dialog: boolean }[] = []
  for (const s of sources) {
    if (s.isCore) continue
    const files = modTexts(s)
    if (!files.length) continue
    const n = translationEntries(files).length
    if (n) out.push({ id: s.id, name: s.name, version: s.version, texts: n, dialog: files.some((f) => f.type === 'strings') })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** A language code as it goes into ids and file names: "de", "pt_br", "zh". */
export const langCode = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

/** mod_info.json keys and files of a new translation mod. */
export function translationModFiles(target: SourceInfo, lang: string, newId: string): { info: Record<string, unknown>; files: Record<string, string> } {
  const csvPath = `${TRANSLATION_DIR}/${target.id}.${lang}.csv`
  const entries = translationEntries(modTexts(target))
  return {
    info: {
      version: '0.1.0',
      description: `A translation of ${target.name}. Needs ${target.name} and SagaLib.`,
      dependencies: [{ id: target.id, name: target.name }, { id: 'lastai_sagalib', name: 'SagaLib', version: '1.2.0' }]
    },
    files: {
      [CONTENT]: `id,type,path,mod\n${target.id}/${lang},translation,${csvPath},${newId}\n`,
      [csvPath]: translationCsv(entries.map((e) => ({ ...e, translation: '' })))
    }
  }
}
