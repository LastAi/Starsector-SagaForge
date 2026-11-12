/** The real Starsector install used by the real-file tests: STARSECTOR_DIR, or D:/Starsector when it exists. */
import fs from 'node:fs'

export const realDir = process.env.STARSECTOR_DIR ?? (fs.existsSync('D:/Starsector/starsector-core') ? 'D:/Starsector' : undefined)
