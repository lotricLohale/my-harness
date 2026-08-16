/**
 * Copy bundled preset directories into the harness-home agent-presets root.
 * Byte-identical trees are skipped so a host restart does not bump mtimes
 * and force a new standing mount generation.
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { basename, join, relative } from 'node:path'

/** @typedef {{ synced: string[], current: string[], failed: { id: string, error: string }[] }} SyncResult */

function filesUnder(root) {
  const out = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) walk(path)
      else out.push(path)
    }
  }
  walk(root)
  return out
}

function sameTree(sourceDir, targetDir) {
  if (!existsSync(targetDir) || !statSync(targetDir).isDirectory()) return false
  const sourceFiles = filesUnder(sourceDir)
  const targetFiles = filesUnder(targetDir)
  if (sourceFiles.length !== targetFiles.length) return false
  const sourceSet = new Set(sourceFiles.map((file) => relative(sourceDir, file)))
  for (const file of targetFiles) {
    if (!sourceSet.has(relative(targetDir, file))) return false
  }
  for (const file of sourceFiles) {
    const dest = join(targetDir, relative(sourceDir, file))
    if (!existsSync(dest)) return false
    if (!readFileSync(file).equals(readFileSync(dest))) return false
  }
  return true
}

/** Copy `sourceDir` onto `targetDir` when the trees differ. */
export function syncOnePreset(sourceDir, targetDir) {
  if (sameTree(sourceDir, targetDir)) return 'current'
  rmSync(targetDir, { recursive: true, force: true })
  mkdirSync(targetDir, { recursive: true })
  cpSync(sourceDir, targetDir, { recursive: true, preserveTimestamps: true })
  return 'synced'
}

/**
 * Sync every directory under `sourceRoot` into `targetRoot`.
 * @param {string} sourceRoot
 * @param {string} targetRoot
 * @returns {SyncResult}
 */
export function syncPresetTrees(sourceRoot, targetRoot) {
  const result = { synced: [], current: [], failed: [] }
  mkdirSync(targetRoot, { recursive: true })
  if (!existsSync(sourceRoot)) return result
  for (const entry of readdirSync(sourceRoot)) {
    const source = join(sourceRoot, entry)
    if (!statSync(source).isDirectory()) continue
    const id = basename(source)
    try {
      const outcome = syncOnePreset(source, join(targetRoot, id))
      result[outcome].push(id)
    } catch (error) {
      result.failed.push({ id, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return result
}
