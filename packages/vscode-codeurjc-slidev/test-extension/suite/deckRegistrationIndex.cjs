// The deck-registration run's entry point: see deckRegistration.test.cjs.
const path = require('node:path')
const Mocha = require('mocha')

exports.run = function run() {
  const mocha = new Mocha({ ui: 'bdd', timeout: 30000, color: true })
  mocha.addFile(path.join(__dirname, 'deckRegistration.test.cjs'))
  return new Promise((resolve, reject) => {
    try {
      mocha.run(failures => (failures > 0 ? reject(new Error(`${failures} test(s) failed.`)) : resolve()))
    }
    catch (err) {
      reject(err)
    }
  })
}
