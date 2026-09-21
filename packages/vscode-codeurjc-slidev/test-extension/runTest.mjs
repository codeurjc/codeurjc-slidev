import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { runTests } from '@vscode/test-electron'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const extensionDevelopmentPath = path.resolve(__dirname, '..')

/** The main smoke suite, against the shared fixture, with every other extension disabled. */
async function runMainSuite() {
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath: path.resolve(__dirname, 'suite', 'index.cjs'),
    launchArgs: [path.resolve(__dirname, 'fixture'), '--disable-extensions'],
  })
}

/**
 * One named suite in a caller's own workspace, on its own. The Playwright-driven
 * live-link test (tests/vscode-geometry-live-link.spec.ts) uses this: its
 * workspace holds the deck its Slidev server is showing, and it needs neither
 * the main fixture nor the deck-registration run.
 */
async function runRequestedSuite(suite, workspace) {
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath: path.resolve(__dirname, 'suite', suite),
    launchArgs: [workspace, '--disable-extensions'],
  })
}

/**
 * Deck registration, against a throwaway copy of fixture-decks/ (the suite
 * writes settings and files into its workspace) and a fresh user-data dir (so
 * no remembered "declined" state carries over). fake-slidev stands in for the
 * official Slidev extension, contributing the setting and command that deck
 * discovery uses.
 */
async function runDeckRegistrationSuite() {
  const scratch = mkdtempSync(path.join(tmpdir(), 'deck-registration-'))
  const workspace = path.join(scratch, 'workspace')
  cpSync(path.resolve(__dirname, 'fixture-decks'), workspace, { recursive: true })
  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath: path.resolve(__dirname, 'suite', 'deckRegistrationIndex.cjs'),
      launchArgs: [
        workspace,
        '--disable-extensions',
        `--extensionDevelopmentPath=${path.resolve(__dirname, 'fake-slidev')}`,
        `--user-data-dir=${path.join(scratch, 'user-data')}`,
      ],
    })
  }
  finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

async function main() {
  try {
    const suite = process.env.CODEURJC_EXT_SUITE
    if (suite) {
      await runRequestedSuite(suite, process.env.CODEURJC_EXT_WORKSPACE ?? path.resolve(__dirname, 'fixture'))
    }
    else {
      await runMainSuite()
      await runDeckRegistrationSuite()
    }
  }
  catch (err) {
    console.error('Extension host smoke tests failed to run', err)
    process.exit(1)
  }
}

main()
