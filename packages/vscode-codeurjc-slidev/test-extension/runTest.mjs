import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { runTests } from '@vscode/test-electron'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, '..')
  const extensionTestsPath = path.resolve(__dirname, 'suite', 'index.cjs')
  const fixturePath = path.resolve(__dirname, 'fixture')

  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [fixturePath, '--disable-extensions'],
    })
  }
  catch (err) {
    console.error('Extension host smoke tests failed to run', err)
    process.exit(1)
  }
}

main()
