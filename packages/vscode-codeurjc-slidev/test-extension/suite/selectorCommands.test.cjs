const assert = require('node:assert')
const path = require('node:path')
const vscode = require('vscode')

function fixtureRoot() {
  const folder = vscode.workspace.workspaceFolders?.[0]
  assert.ok(folder, 'no fixture workspace folder open')
  return folder.uri.fsPath
}

describe('copy/paste selector commands', () => {
  it('copies a content-anchor selector from a Foo.java selection, then pastes it into the slides.md import', async () => {
    const fooUri = vscode.Uri.file(path.join(fixtureRoot(), 'code', 'Foo.java'))
    const fooDoc = await vscode.workspace.openTextDocument(fooUri)
    const fooEditor = await vscode.window.showTextDocument(fooDoc)

    const lines = fooDoc.getText().split('\n')
    const startLine = lines.findIndex(l => l.includes('getNotasAlumno'))
    const endLine = lines.findIndex(l => l.includes('return 1.0f;'))
    assert.ok(startLine >= 0 && endLine >= 0, 'fixture Foo.java should contain both boundary lines')
    fooEditor.selection = new vscode.Selection(new vscode.Position(startLine, 0), new vscode.Position(endLine, lines[endLine].length))

    await vscode.commands.executeCommand('codeurjc-slidev.copySelectorForSelection')
    const clipboardText = await vscode.env.clipboard.readText()
    assert.strictEqual(clipboardText, '["public float getNotasAlumno(int idAlumno) {".."return 1.0f;"]')

    const slidesUri = vscode.Uri.file(path.join(fixtureRoot(), 'slides.md'))
    const slidesDoc = await vscode.workspace.openTextDocument(slidesUri)
    const slidesEditor = await vscode.window.showTextDocument(slidesDoc)

    const importLineIdx = slidesDoc.getText().split('\n').findIndex(l => l.startsWith('<<< @/code/Foo.java java'))
    assert.ok(importLineIdx >= 0, 'fixture slides.md should contain the Foo.java import')
    slidesEditor.selection = new vscode.Selection(new vscode.Position(importLineIdx, 0), new vscode.Position(importLineIdx, 0))

    await vscode.commands.executeCommand('codeurjc-slidev.pasteSelectorIntoImport')
    const updatedLine = slidesDoc.lineAt(importLineIdx).text
    assert.strictEqual(updatedLine, '<<< @/code/Foo.java["public float getNotasAlumno(int idAlumno) {".."return 1.0f;"] java')

    // Undo the edit so this test doesn't permanently mutate the shared fixture for later runs.
    await vscode.commands.executeCommand('undo')
  })

  it('reports an error and makes no edit when the clipboard holds an invalid selector', async () => {
    await vscode.env.clipboard.writeText('not a selector')

    const slidesUri = vscode.Uri.file(path.join(fixtureRoot(), 'slides.md'))
    const slidesDoc = await vscode.workspace.openTextDocument(slidesUri)
    const slidesEditor = await vscode.window.showTextDocument(slidesDoc)
    const importLineIdx = slidesDoc.getText().split('\n').findIndex(l => l.startsWith('<<< @/code/Foo.java java'))
    const before = slidesDoc.lineAt(importLineIdx).text
    slidesEditor.selection = new vscode.Selection(new vscode.Position(importLineIdx, 0), new vscode.Position(importLineIdx, 0))

    await vscode.commands.executeCommand('codeurjc-slidev.pasteSelectorIntoImport')

    assert.strictEqual(slidesDoc.lineAt(importLineIdx).text, before, 'line should be unchanged for an invalid clipboard selector')
  })
})
