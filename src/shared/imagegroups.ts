/**
 * #67 U21 (user, 2026-11-21): the user's own image groups, per image kind, for organising the Images
 * page and filtering the image pickers. Stored in project.json `imageGroups` (editor only, never
 * exported). An image (by its path) may be in several groups.
 */
import type { ModModel } from './serialize'

export interface ImageGroup { name: string; images: string[] }

export const groupsOf = (p: ModModel['project'], kind: string): ImageGroup[] => p.imageGroups?.[kind] ?? []

/** The groups an image is in (names). */
export const groupsWith = (p: ModModel['project'], kind: string, path: string): string[] => groupsOf(p, kind).filter((g) => g.images.includes(path)).map((g) => g.name)

/** Adds a group (a trimmed, unused name); false when the name is empty or taken. */
export function addGroup(p: ModModel['project'], kind: string, name: string): boolean {
  const n = name.trim()
  if (!n || groupsOf(p, kind).some((g) => g.name.toLowerCase() === n.toLowerCase())) return false
  p.imageGroups ??= {}
  ;((p.imageGroups[kind] ??= []), p.imageGroups[kind]).push({ name: n, images: [] })
  return true
}

export function renameGroup(p: ModModel['project'], kind: string, from: string, to: string): boolean {
  const n = to.trim()
  const g = groupsOf(p, kind).find((x) => x.name === from)
  if (!g || !n || (n.toLowerCase() !== from.toLowerCase() && groupsOf(p, kind).some((x) => x.name.toLowerCase() === n.toLowerCase()))) return false
  g.name = n
  return true
}

/** Deletes a group (its images stay in the mod). */
export function deleteGroup(p: ModModel['project'], kind: string, name: string): void {
  if (!p.imageGroups?.[kind]) return
  p.imageGroups[kind] = p.imageGroups[kind].filter((g) => g.name !== name)
  if (!p.imageGroups[kind].length) delete p.imageGroups[kind]
  if (!Object.keys(p.imageGroups).length) delete p.imageGroups
}

/** Puts images into a group (made if it doesn't exist yet). */
export function addToGroup(p: ModModel['project'], kind: string, name: string, paths: string[]): void {
  if (!groupsOf(p, kind).some((g) => g.name === name) && !addGroup(p, kind, name)) return
  const g = groupsOf(p, kind).find((x) => x.name === name.trim())!
  for (const path of paths) if (!g.images.includes(path)) g.images.push(path)
  g.images.sort()
}

export function removeFromGroup(p: ModModel['project'], kind: string, name: string, paths: string[]): void {
  const g = groupsOf(p, kind).find((x) => x.name === name)
  if (g) g.images = g.images.filter((x) => !paths.includes(x))
}

/** A filter for lists: '' = all, '\u0000none' = in no group, else a group's name. */
export const UNGROUPED = '\u0000none'
export function inFilter(p: ModModel['project'], kind: string, filter: string, path: string): boolean {
  if (!filter) return true
  if (filter === UNGROUPED) return !groupsOf(p, kind).some((g) => g.images.includes(path))
  return groupsOf(p, kind).find((g) => g.name === filter)?.images.includes(path) ?? false
}
