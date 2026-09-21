const assert = require('node:assert')
const path = require('node:path')
const vscode = require('vscode')

// The fixture holds several theme decks in one project (slides.md, steps.md,
// geometry.md), so the multi-deck tip applies to it. Runs first: any deck an
// earlier suite opened would already have shown the tip.

function fixtureRoot() {
  const folder = vscode.workspace.workspaceFolders?.[0]
  assert.ok(folder, 'no fixture workspace folder open')
  return folder.uri.fsPath
}

const settle = () => new Promise(resolve => setTimeout(resolve, 500))

async function open(file) {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(fixtureRoot(), file)))
  await vscode.window.showTextDocument(document)
  await settle()
}

const api = () => vscode.extensions.getExtension('codeurjc.vscode-codeurjc-slidev').exports

describe('deck discovery tip', () => {
  after(async () => {
    await vscode.workspace.getConfiguration('codeurjcSlidev').update('deckDiscovery.enabled', undefined, vscode.ConfigurationTarget.Global)
    await api().resetDeckTip()
  })

  it('is silenced by codeurjcSlidev.deckDiscovery.enabled', async () => {
    await vscode.extensions.getExtension('codeurjc.vscode-codeurjc-slidev').activate()
    await api().resetDeckTip()
    await vscode.workspace.getConfiguration('codeurjcSlidev').update('deckDiscovery.enabled', false, vscode.ConfigurationTarget.Global)
    await open('geometry.md')
    assert.strictEqual(api().deckTipShown(), false)
  })

  it('is shown the first time a deck of a multi-deck project is opened', async () => {
    await vscode.workspace.getConfiguration('codeurjcSlidev').update('deckDiscovery.enabled', undefined, vscode.ConfigurationTarget.Global)
    await open('steps.md')
    assert.strictEqual(api().deckTipShown(), true)
  })
})
