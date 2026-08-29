import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'

function digestFrame(hash, values) {
  for (const value of values) {
    const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8')
    hash.update(String(buffer.length))
    hash.update(':')
    hash.update(buffer)
    hash.update('\0')
  }
}

/**
 * Hash a Git-portable directory tree. File contents, paths, executable bits, and symlink targets
 * are authoritative; mtimes, uid/gid, and empty directories are intentionally ignored.
 */
export function computeContentDigest(directory) {
  const root = realpathSync(directory)
  const hash = createHash('sha256')

  const walk = (from, prefix = '') => {
    const entries = readdirSync(from, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'en'))

    for (const entry of entries) {
      const path = resolve(from, entry.name)
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name
      const stat = lstatSync(path)

      if (stat.isDirectory()) {
        walk(path, relativePath)
      } else if (stat.isSymbolicLink()) {
        digestFrame(hash, ['symlink', relativePath, readlinkSync(path)])
      } else if (stat.isFile()) {
        const executable = (stat.mode & 0o111) === 0 ? '0644' : '0755'
        digestFrame(hash, ['file', relativePath, executable, readFileSync(path)])
      } else {
        throw new Error(`Unsupported file type in plugin snapshot: ${path}`)
      }
    }
  }

  walk(root)
  return `sha256:${hash.digest('hex')}`
}
