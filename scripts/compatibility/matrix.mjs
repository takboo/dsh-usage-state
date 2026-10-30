import { appendFileSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { exactVersion } from './state.mjs'

export function matrixVersions(content) {
  const value = JSON.parse(content)
  const versions = value?.versions
  if (!value || Object.keys(value).join(',') !== 'versions' || !Array.isArray(versions) || !versions.length || versions.length > 64 || !versions.every(exactVersion) || new Set(versions).size !== versions.length) throw new Error('Expected 1–64 unique exact DSH matrix versions')
  return versions
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const versions = matrixVersions(readFileSync('.github/dsh-compatibility.json', 'utf8'))
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `versions=${JSON.stringify(versions)}\n`)
  console.log(JSON.stringify(versions))
}
