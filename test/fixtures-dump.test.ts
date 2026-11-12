/** Writes the example plans to .userdata/fixtures (for screenshots of the app with real content). */
import { it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { lostConvoy, reyes } from './fixtures/vgc'

it('dumps the example plans', () => {
  const dir = path.resolve(__dirname, '..', '.userdata', 'fixtures')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'vgc_lost_convoy.quest.json'), JSON.stringify(lostConvoy(), null, 2) + '\n')
  fs.writeFileSync(path.join(dir, 'people.json'), JSON.stringify({ format: 1, people: [reyes] }, null, 2) + '\n')
  expect(fs.existsSync(path.join(dir, 'people.json'))).toBe(true)
})
