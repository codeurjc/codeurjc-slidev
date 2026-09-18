const assert = require('node:assert')
const path = require('node:path')
const vscode = require('vscode')

function fixtureRoot() {
  const folder = vscode.workspace.workspaceFolders?.[0]
  assert.ok(folder, 'no fixture workspace folder open')
  return folder.uri.fsPath
}

async function openGeometryDeck() {
  const uri = vscode.Uri.file(path.join(fixtureRoot(), 'geometry.md'))
  const document = await vscode.workspace.openTextDocument(uri)
  await vscode.window.showTextDocument(document)
  return document
}

async function waitFor(check, what) {
  const deadline = Date.now() + 10000
  for (;;) {
    const value = await check()
    if (value)
      return value
    if (Date.now() > deadline)
      assert.fail(`timed out waiting for ${what}`)
    await new Promise(resolve => setTimeout(resolve, 200))
  }
}

describe('per-slide geometry', () => {
  it('diagnoses an entry that matches nothing, with no dev server running', async () => {
    const document = await openGeometryDeck()
    const entryLine = document.getText().split('\n').findIndex(l => l.includes('{id: flow'))
    const diagnostic = await waitFor(
      () => vscode.languages.getDiagnostics(document.uri).find(d => d.message.includes('matches nothing')),
      'a "matches nothing" diagnostic',
    )
    assert.strictEqual(diagnostic.range.start.line, entryLine)
  })

  it('offers a quick fix that adds the id to the mermaid fence', async () => {
    const document = await openGeometryDeck()
    const entryLine = document.getText().split('\n').findIndex(l => l.includes('{id: flow'))
    const actions = await vscode.commands.executeCommand(
      'vscode.executeCodeActionProvider',
      document.uri,
      new vscode.Range(entryLine, 8, entryLine, 8),
    )
    const fix = actions.find(a => a.title.startsWith('Add {id: \'flow\'}'))
    assert.ok(fix, `expected the add-id quick fix, got: ${JSON.stringify(actions.map(a => a.title))}`)
    assert.ok(fix.edit, 'the quick fix should carry an edit')
  })

  it('completes an id from the slide\'s own content', async () => {
    const document = await openGeometryDeck()
    const fenceLine = document.getText().split('\n').findIndex(l => l === '```mermaid')
    const edit = new vscode.WorkspaceEdit()
    edit.insert(document.uri, new vscode.Position(fenceLine, '```mermaid'.length), ' {id: \'diagram\'}')
    await vscode.workspace.applyEdit(edit)
    try {
      const entryLine = document.getText().split('\n').findIndex(l => l.includes('{id: flow'))
      const position = new vscode.Position(entryLine, document.lineAt(entryLine).text.indexOf('flow'))
      const result = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', document.uri, position)
      const labels = result.items.map(i => (typeof i.label === 'string' ? i.label : i.label.label))
      assert.ok(labels.includes('diagram'), `expected a "diagram" completion, got: ${JSON.stringify(labels)}`)
    }
    finally {
      await vscode.commands.executeCommand('undo')
      await document.save()
    }
  })

  it('registers the preview inspection commands, which need no companion extension to exist', async () => {
    const commands = await vscode.commands.getCommands(true)
    assert.ok(commands.includes('codeurjc-slidev.inspectGeometry'))
    assert.ok(commands.includes('codeurjc-slidev.stopInspectingGeometry'))
  })
})
