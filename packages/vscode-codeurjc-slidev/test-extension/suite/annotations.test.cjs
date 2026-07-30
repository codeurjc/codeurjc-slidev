const assert = require('node:assert')
const path = require('node:path')
const vscode = require('vscode')

function fixtureRoot() {
  const folder = vscode.workspace.workspaceFolders?.[0]
  assert.ok(folder, 'no fixture workspace folder open')
  return folder.uri.fsPath
}

async function settle() {
  // Gives the extension's document-open/change listeners a tick to run
  // before asserting on their effects.
  await new Promise(resolve => setTimeout(resolve, 500))
}

describe('Active-buffer marker annotations', () => {
  it('shows a hover on the anchor line following a <<< import', async () => {
    const slidesUri = vscode.Uri.file(path.join(fixtureRoot(), 'slides.md'))
    const document = await vscode.workspace.openTextDocument(slidesUri)
    await vscode.window.showTextDocument(document)
    await settle()

    const anchorLine = document.getText().split('\n').findIndex(l => l.startsWith('[!mark:'))
    assert.ok(anchorLine >= 0, 'fixture should contain an anchor line')

    const hovers = await vscode.commands.executeCommand(
      'vscode.executeHoverProvider',
      document.uri,
      new vscode.Position(anchorLine, 0),
    )
    assert.ok(hovers.length > 0, 'expected at least one hover on the anchor line')
  })
})

describe('Reference-index CodeLens', () => {
  it('shows a CodeLens on the line referenced from slides.md', async () => {
    // Ensure slides.md (which contributes the reference) has been read at least once.
    const slidesUri = vscode.Uri.file(path.join(fixtureRoot(), 'slides.md'))
    await vscode.workspace.openTextDocument(slidesUri)

    const fooUri = vscode.Uri.file(path.join(fixtureRoot(), 'code', 'Foo.java'))
    const document = await vscode.workspace.openTextDocument(fooUri)
    await vscode.window.showTextDocument(document)
    await settle()

    const lenses = await vscode.commands.executeCommand('vscode.executeCodeLensProvider', document.uri)
    assert.ok(lenses.length > 0, 'expected at least one code lens on the referenced file')
  })
})
