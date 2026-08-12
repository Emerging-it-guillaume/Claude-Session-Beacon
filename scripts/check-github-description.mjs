/**
 * Checks that the GitHub repository description is, word for word, the `description`
 * of the manifest — the text the Marketplace prints under the title. Two wordings
 * would read as two products, and nothing on either side would say so.
 *
 * Kept out of `npm test` on purpose: it needs the network and an authenticated
 * `gh`. Run `npm run check:description` when either text changes.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const repository = manifest.repository.url.replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '')

const actual = execFileSync('gh', ['api', `repos/${repository}`, '--jq', '.description'], {
  encoding: 'utf8',
}).trim()

if (actual === manifest.description) {
  console.log('GitHub description matches the manifest.')
  process.exit(0)
}

console.error(`GitHub description does not match the manifest.

  manifest: ${manifest.description}
  github:   ${actual}

Fix it with:

  gh repo edit ${repository} --description ${JSON.stringify(manifest.description)}
`)
process.exit(1)
