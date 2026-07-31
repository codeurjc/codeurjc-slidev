const assert = require('node:assert')
const path = require('node:path')
const vscode = require('vscode')

function fixtureRoot() {
  const folder = vscode.workspace.workspaceFolders?.[0]
  assert.ok(folder, 'no fixture workspace folder open')
  return folder.uri.fsPath
}

describe('snippet-import path completion', () => {
  it('offers a completion for the code root\'s Foo.java on a bare "<<< @/" line', async () => {
    const slidesUri = vscode.Uri.file(path.join(fixtureRoot(), 'slides.md'))
    const document = await vscode.workspace.openTextDocument(slidesUri)
    await vscode.window.showTextDocument(document)

    const bareLineIdx = document.getText().split('\n').findIndex(l => l === '<<< @/')
    assert.ok(bareLineIdx >= 0, 'fixture should contain a bare "<<< @/" line')
    const position = new vscode.Position(bareLineIdx, '<<< @/'.length)

    const result = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', document.uri, position)
    const labels = result.items.map(i => (typeof i.label === 'string' ? i.label : i.label.label))
    assert.ok(labels.includes('Foo.java'), `expected a Foo.java completion, got: ${JSON.stringify(labels)}`)
  })
})
