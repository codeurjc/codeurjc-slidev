const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vscode = require('vscode')

// Runs against a copy of fixture-decks/ (a monorepo-like workspace holding one
// project under projects/AIS) with fake-slidev standing in for the official
// Slidev extension. The prompts are answered by replacing
// vscode.window.showInformationMessage, so the real offer/registration code
// runs end to end, and `slidev.include` is resolved by VS Code's own globbing.

const AIS = 'projects/AIS'
const EXPECTED_DECKS = ['1-introduccion.md', '2-refactorizacion.md', '3-tdd.md', '4-curso [beta].md'].map(f => `${AIS}/${f}`)

const root = () => vscode.workspace.workspaceFolders[0].uri.fsPath
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(condition, what, ms = 10000) {
  const start = Date.now()
  while (!(await condition())) {
    if (Date.now() - start > ms)
      throw new Error(`timed out waiting for ${what}`)
    await wait(100)
  }
}

const prompts = []
let answer = () => undefined
const original = vscode.window.showInformationMessage
const offers = () => prompts.filter(p => p.message.includes('known to the Slidev extension'))
const tips = () => prompts.filter(p => p.message.includes('several slide decks'))

const slidev = () => vscode.workspace.getConfiguration('slidev')
const workspaceInclude = () => slidev().inspect('include').workspaceValue
const discovery = () => vscode.workspace.getConfiguration('codeurjcSlidev')
const setEnabled = value => discovery().update('deckDiscovery.enabled', value, vscode.ConfigurationTarget.Workspace)
const ext = () => vscode.extensions.getExtension('codeurjc.vscode-codeurjc-slidev')
const fake = () => vscode.extensions.getExtension('test.fake-slidev')

describe('deck registration with the Slidev extension', () => {
  before(async () => {
    vscode.window.showInformationMessage = async (message, ...items) => {
      prompts.push({ message, items })
      return answer(message, items)
    }
    await ext().activate()
    await fake().activate()
  })

  after(() => {
    vscode.window.showInformationMessage = original
  })

  it('offers the decks nothing registers, and registers them last-edited first with glob metacharacters escaped', async () => {
    // The deck last edited comes first, so it becomes the Slidev extension's default.
    const edited = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root(), AIS, '2-refactorizacion.md')))
    const edit = new vscode.WorkspaceEdit()
    edit.insert(edited.uri, new vscode.Position(edited.lineCount, 0), '\nedited\n')
    await vscode.workspace.applyEdit(edit)

    answer = message => (message.includes('known to the Slidev extension') ? 'Register' : undefined)
    await setEnabled(true)
    await until(() => workspaceInclude() !== undefined, 'slidev.include to be written')

    assert.strictEqual(offers().length, 1)
    assert.match(offers()[0].message, /^4 slide decks/)
    assert.deepStrictEqual(workspaceInclude(), [
      `${AIS}/2-refactorizacion.md`,
      `${AIS}/1-introduccion.md`,
      `${AIS}/3-tdd.md`,
      `${AIS}/4-curso [[]beta[]].md`,
      '**/slides.md',
    ])
  })

  it('resolves to exactly the decks: not the comparison deck, the README, or a sibling of the escaped name', async () => {
    const found = new Set()
    for (const pattern of slidev().get('include'))
      (await vscode.workspace.findFiles(pattern, slidev().get('exclude'))).forEach(uri => found.add(path.relative(root(), uri.fsPath).split(path.sep).join('/')))
    assert.deepStrictEqual([...found].sort(), ['slides.md', ...EXPECTED_DECKS].sort())
  })

  it('does not offer again once every deck is covered', async () => {
    const before = offers().length
    await setEnabled(false)
    await setEnabled(true)
    await wait(1000)
    assert.strictEqual(offers().length, before)
  })

  it('does not repeat a declined offer for the same decks, and offers again when a deck appears', async () => {
    answer = message => (message.includes('known to the Slidev extension') ? 'Not now' : undefined)
    await slidev().update('include', undefined, vscode.ConfigurationTarget.Workspace)
    const afterReset = offers().length + 1
    await until(() => offers().length >= afterReset, 'the offer after resetting slidev.include')

    await setEnabled(false)
    await setEnabled(true)
    await wait(1000)
    assert.strictEqual(offers().length, afterReset, 'the same set of decks was offered again')

    answer = message => (message.includes('known to the Slidev extension') ? 'Register' : undefined)
    fs.writeFileSync(path.join(root(), AIS, '5-nuevo.md'), '---\ntheme: codeurjc-slidev-theme\n---\n\n# Nuevo\n')
    await until(() => workspaceInclude() !== undefined, 'the new deck to be offered and registered')
    assert.ok(workspaceInclude().includes(`${AIS}/5-nuevo.md`))
    assert.strictEqual(workspaceInclude()[0], `${AIS}/2-refactorizacion.md`)
  })

  it('shows the tip once, and its button runs the Slidev extension\'s choose-entry command', async () => {
    // Earlier steps may already have shown it (a deck became the active editor); count from here.
    await ext().exports.resetDeckTip()
    const shownBefore = tips().length
    answer = message => (message.includes('several slide decks') ? 'Choose deck…' : undefined)
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root(), AIS, '1-introduccion.md')))
    await vscode.window.showTextDocument(document)
    await until(() => fake().exports.chooseEntryCalls() === 1, 'choose-entry to run')
    assert.strictEqual(tips().length, shownBefore + 1)

    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(root(), AIS, '3-tdd.md'))))
    await wait(500)
    assert.strictEqual(tips().length, shownBefore + 1)
  })
})
