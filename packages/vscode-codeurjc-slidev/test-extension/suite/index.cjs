// Entry point required by the extension host (@vscode/test-electron) itself
// -- must be CommonJS regardless of the package's own "type": "module",
// since it is loaded via a plain `require()` inside the running VS Code
// process, not through Node's own module resolution for this package.
const path = require('node:path')
const Mocha = require('mocha')

exports.run = function run() {
  const mocha = new Mocha({ ui: 'bdd', timeout: 20000, color: true })
  const testsRoot = path.resolve(__dirname)

  mocha.addFile(path.join(testsRoot, 'importSourceCodeLens.test.cjs'))
  mocha.addFile(path.join(testsRoot, 'activation.test.cjs'))
  mocha.addFile(path.join(testsRoot, 'annotations.test.cjs'))
  mocha.addFile(path.join(testsRoot, 'completion.test.cjs'))
  mocha.addFile(path.join(testsRoot, 'selectorCommands.test.cjs'))

  return new Promise((resolve, reject) => {
    try {
      mocha.run((failures) => {
        if (failures > 0)
          reject(new Error(`${failures} test(s) failed.`))
        else resolve()
      })
    }
    catch (err) {
      reject(err)
    }
  })
}
