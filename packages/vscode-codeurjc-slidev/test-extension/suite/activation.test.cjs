const assert = require('node:assert')
const vscode = require('vscode')

describe('extension activation', () => {
  it('activates and registers the reference-navigation command', async () => {
    const ext = vscode.extensions.getExtension('codeurjc.vscode-codeurjc-slidev')
    assert.ok(ext, 'extension not found -- check the publisher.name in package.json matches')
    await ext.activate()
    assert.strictEqual(ext.isActive, true)

    const commands = await vscode.commands.getCommands(true)
    assert.ok(commands.includes('codeurjc-slidev.openReference'))
  })
})
