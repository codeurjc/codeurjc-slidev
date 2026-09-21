// Suite entry for the live-link test, which needs a Slidev dev server and a
// browser page driven from outside VS Code (tests/vscode-geometry-live-link.spec.ts
// starts both, then launches this through runTest.mjs). Kept out of index.cjs,
// which must run standalone.
const path = require('node:path')
const Mocha = require('mocha')

exports.run = function run() {
  const mocha = new Mocha({ ui: 'bdd', timeout: 60000, color: false })
  mocha.addFile(path.join(__dirname, 'liveLink.test.cjs'))
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
