const assert = require('node:assert')
const path = require('node:path')
const vscode = require('vscode')

function fixtureRoot() {
  const folder = vscode.workspace.workspaceFolders?.[0]
  assert.ok(folder, 'no fixture workspace folder open')
  return folder.uri.fsPath
}

async function settle() {
  await new Promise(resolve => setTimeout(resolve, 500))
}

/** The badges the extension painted in `document`, as `[line text, badge text]`, through its exports test hook. */
function paintedBadges(document) {
  const api = vscode.extensions.getExtension('codeurjc.vscode-codeurjc-slidev').exports
  const lines = document.getText().split('\n')
  return api.stepBadgesFor(document.uri.toString()).map(b => [lines[b.line], b.text])
}

async function openSteps() {
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(fixtureRoot(), 'steps.md')))
  await vscode.window.showTextDocument(document)
  await settle()
  return document
}

async function setShowTotal(value) {
  await vscode.workspace.getConfiguration('codeurjcSlidev').update('stepBadges.showTotal', value, vscode.ConfigurationTarget.Global)
  await settle()
}

function hoverText(hovers) {
  return hovers.flatMap(h => h.contents.map(c => (typeof c === 'string' ? c : c.value))).join('\n')
}

describe('click-step badges', () => {
  after(async () => {
    await setShowTotal(undefined)
  })

  it('paints step badges with the slide total, and no total on an uncountable slide', async () => {
    await vscode.extensions.getExtension('codeurjc.vscode-codeurjc-slidev').activate()
    const document = await openSteps()
    assert.deepStrictEqual(paintedBadges(document), [
      ['int a = 1; // [!mark{2}] Two', '▸2 of 3'],
      ['int b = 2; // [!mark:start{3}] Range', '▸3 of 3'],
      ['int c = 3;', '▸1 of 3'],
      ['[!mark:"this.alumnos = alumnos"{1}] Assigns', '▸1 of 3'],
      ['int e = 5; // [!mark{2}] Still two', '▸2'],
    ])
  })

  it('says at which click a marker and an anchor appear', async () => {
    const document = await openSteps()
    const lines = document.getText().split('\n')
    const markerHovers = await vscode.commands.executeCommand('vscode.executeHoverProvider', document.uri, new vscode.Position(lines.indexOf('int a = 1; // [!mark{2}] Two'), 0))
    assert.match(hoverText(markerHovers), /Highlight revealed at click 2 of 3/)
    const anchorHovers = await vscode.commands.executeCommand('vscode.executeHoverProvider', document.uri, new vscode.Position(lines.findIndex(l => l.startsWith('[!mark:"this.alumnos')), 0))
    assert.match(hoverText(anchorHovers), /Highlight revealed at click 1 of 3/)
    const uncountable = await vscode.commands.executeCommand('vscode.executeHoverProvider', document.uri, new vscode.Position(lines.indexOf('int e = 5; // [!mark{2}] Still two'), 0))
    assert.match(hoverText(uncountable), /<MyStepper> on line \d+ may add clicks/)
  })

  it('adds the step to the reference CodeLens in the code file', async () => {
    await openSteps()
    const foo = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(fixtureRoot(), 'code', 'Foo.java')))
    await vscode.window.showTextDocument(foo)
    await settle()
    const lenses = await vscode.commands.executeCommand('vscode.executeCodeLensProvider', foo.uri, 10)
    const titles = lenses.map(l => l.command?.title ?? '')
    assert.ok(titles.some(t => t.includes('Slide 1 ▸1 of 3')), `expected a stepped reference in ${JSON.stringify(titles)}`)
  })

  it('drops the total from badges and lenses when the setting is off', async () => {
    await setShowTotal(false)
    const document = await openSteps()
    assert.deepStrictEqual(paintedBadges(document).map(([, text]) => text), ['▸2', '▸3', '▸1', '▸1', '▸2'])

    const foo = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(fixtureRoot(), 'code', 'Foo.java')))
    const lenses = await vscode.commands.executeCommand('vscode.executeCodeLensProvider', foo.uri, 10)
    const titles = lenses.map(l => l.command?.title ?? '')
    assert.ok(titles.some(t => t.includes('Slide 1 ▸1') && !t.includes('of 3')), `expected a stepped reference without total in ${JSON.stringify(titles)}`)

    await setShowTotal(true)
    assert.deepStrictEqual(paintedBadges(await openSteps()).map(([, text]) => text), ['▸2 of 3', '▸3 of 3', '▸1 of 3', '▸1 of 3', '▸2'])
  })
})
