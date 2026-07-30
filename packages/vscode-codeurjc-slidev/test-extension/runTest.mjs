import { runTests } from '@vscode/test-electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

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
