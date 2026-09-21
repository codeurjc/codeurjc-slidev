// "Inspect Geometry in Preview", end to end: a real Slidev dev server with a
// real Chromium page on the deck, and this extension in a real VS Code. The
// page and the server live in the Playwright test that launched us; it
// exposes what only a browser can do over a small HTTP hook
// (CODEURJC_TEST_CONTROL): read the preview's state, and drag an element in it.
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const vscode = require('vscode')

const control = process.env.CODEURJC_TEST_CONTROL
const slidevUrl = process.env.CODEURJC_TEST_SLIDEV_URL

const ENTRY = '- { id: flow,'

function deckPath() {
  const folder = vscode.workspace.workspaceFolders?.[0]
  assert.ok(folder, 'no workspace folder open')
  return path.join(folder.uri.fsPath, 'slides.md')
}

async function waitFor(check, what, timeout = 20000) {
  const deadline = Date.now() + timeout
  for (;;) {
    const value = await check()
    if (value)
      return value
    if (Date.now() > deadline)
      assert.fail(`timed out waiting for ${typeof what === 'function' ? what() : what}`)
    await new Promise(resolve => setTimeout(resolve, 200))
  }
}

/** What the preview shows: `inspected`, `highlighted` (a count) and the flow overlay's `x`. */
async function previewState() {
  return (await fetch(`${control}/state`)).json()
}

/**
 * A page that was dragged but never saved keeps the element where it was
 * dropped (by design), so a test that leaves the file as it was reloads the
 * preview to match it. The server replays the controller's state to the new page.
 */
async function reloadPreview() {
  const res = await fetch(`${control}/reload`, { method: 'POST' })
  assert.ok(res.ok, `reloading the preview failed: ${res.status}`)
}

async function dragInPreview(dx) {
  // A save makes Slidev re-render the deck, and the page takes a moment to be
  // back in the state the extension left it (outlined, at the file's rect).
  await waitFor(async () => {
    const s = await previewState()
    return s.inspected && s.x === 500
  }, 'the preview to settle on the deck as written')
  await new Promise(resolve => setTimeout(resolve, 1000))
  const res = await fetch(`${control}/drag?dx=${dx}`, { method: 'POST' })
  assert.ok(res.ok, `the preview drag failed: ${res.status}`)
}

/** The x written on the `flow` entry, or null when it isn't a plain number. */
function flowX(text) {
  const line = text.split('\n').find(l => l.includes(ENTRY))
  return Number(/\bx:\s*(-?\d+)/.exec(line ?? '')?.[1])
}

function entryLine(document) {
  return document.getText().split('\n').findIndex(l => l.includes(ENTRY))
}

async function setSaveOnDrag(value) {
  const config = vscode.workspace.getConfiguration('codeurjcSlidev')
  await config.update('geometry.saveOnDrag', value, vscode.ConfigurationTarget.Workspace)
  // The extension reads it on each drag; make sure the change has landed.
  await waitFor(() => vscode.workspace.getConfiguration('codeurjcSlidev').get('geometry.saveOnDrag') === (value ?? true), `saveOnDrag to read ${value}`)
}

describe('geometry live link', () => {
  let document
  let original

  before(async () => {
    assert.ok(control && slidevUrl, 'CODEURJC_TEST_CONTROL / CODEURJC_TEST_SLIDEV_URL not set: run this through tests/vscode-geometry-live-link.spec.ts')
    await vscode.workspace.getConfiguration('codeurjcSlidev').update('devServer.url', slidevUrl, vscode.ConfigurationTarget.Workspace)
    document = await vscode.workspace.openTextDocument(vscode.Uri.file(deckPath()))
    const editor = await vscode.window.showTextDocument(document)
    original = document.getText()
    // The cursor on the entry, so attaching highlights it.
    const line = entryLine(document)
    assert.ok(line >= 0, 'the flow entry is not in the deck')
    editor.selection = new vscode.Selection(line, 6, line, 6)
  })

  afterEach(async () => {
    // Every test starts from the file as it was written.
    if (document.isDirty || document.getText() !== original) {
      const edit = new vscode.WorkspaceEdit()
      edit.replace(document.uri, document.validateRange(new vscode.Range(0, 0, document.lineCount, 0)), original)
      await vscode.workspace.applyEdit(edit)
      await document.save()
    }
    await reloadPreview()
  })

  after(async () => {
    await vscode.commands.executeCommand('codeurjc-slidev.stopInspectingGeometry')
    await setSaveOnDrag(undefined)
  })

  it('attaching outlines the preview and highlights the entry under the cursor', async () => {
    await vscode.commands.executeCommand('codeurjc-slidev.inspectGeometry')
    // `highlighted` also proves the deck the page announced is this document:
    // nothing slide-addressed is sent until they match.
    await waitFor(async () => {
      const s = await previewState()
      return s.inspected && s.highlighted === 1
    }, 'the preview to be inspected, with one entry highlighted')
  })

  it('moving the cursor off the entry drops the highlight', async () => {
    const editor = vscode.window.activeTextEditor
    editor.selection = new vscode.Selection(0, 0, 0, 0)
    await waitFor(async () => (await previewState()).highlighted === 0, 'the highlight to go')
    const line = entryLine(document)
    editor.selection = new vscode.Selection(line, 6, line, 6)
    await waitFor(async () => (await previewState()).highlighted === 1, 'the highlight to return')
  })

  it('a drag in the preview edits the entry, saves the file, and the preview re-renders from it', async () => {
    await setSaveOnDrag(true)
    const before = flowX(document.getText())
    assert.strictEqual(before, 500)
    await dragInPreview(-60)
    await waitFor(() => flowX(document.getText()) < before, 'the drag to reach the editor buffer')
    const x = flowX(document.getText())
    // Only that entry's rect moved.
    const expected = original.replace(/(- \{ id: flow, x: )500/, `$1${x}`)
    assert.strictEqual(document.getText(), expected)
    // Saved (save-on-drag) so the dev server sees it...
    await waitFor(() => !document.isDirty, 'the drag to be saved')
    assert.strictEqual(fs.readFileSync(deckPath(), 'utf-8'), expected)
    // ...and the preview now renders from the file.
    await waitFor(async () => (await previewState()).x === x, `the preview to show x=${x}`)
  })

  it('one undo takes a drag back', async () => {
    await setSaveOnDrag(false)
    await dragInPreview(-60)
    await waitFor(() => flowX(document.getText()) < 500, () => `the drag to reach the editor buffer (the file says x=${flowX(fs.readFileSync(deckPath(), 'utf-8'))})`)
    await vscode.commands.executeCommand('undo')
    assert.strictEqual(document.getText(), original)
  })

  it('with save-on-drag off, the drag stays unsaved in the editor', async () => {
    await setSaveOnDrag(false)
    await dragInPreview(-60)
    await waitFor(() => flowX(document.getText()) < 500, 'the drag to reach the editor buffer')
    // VS Code reports the dirty flag to the extension host a beat after the
    // content change, so poll for it, then give a wrongly-issued save time to
    // show up before trusting that none was.
    await waitFor(() => document.isDirty, 'the buffer to be reported dirty')
    await new Promise(resolve => setTimeout(resolve, 1500))
    assert.ok(document.isDirty, 'the buffer should be left unsaved')
    assert.strictEqual(fs.readFileSync(deckPath(), 'utf-8'), original, 'the file should be untouched')
  })

  it('a drag is not applied when unsaved edits have moved the slide out from under the preview', async () => {
    await setSaveOnDrag(false)
    // A new slide before the geometry one: the preview's slide 2 is slide 3 here.
    const edit = new vscode.WorkspaceEdit()
    const insertAt = document.getText().split('\n').findIndex((l, i) => l === '---' && i > 5)
    edit.insert(document.uri, new vscode.Position(insertAt, 0), '---\n\n# Extra\n\n')
    assert.ok(await vscode.workspace.applyEdit(edit))
    const stale = document.getText()
    await dragInPreview(-60)
    // Give a wrongly-applied edit time to show up.
    await new Promise(resolve => setTimeout(resolve, 3000))
    assert.strictEqual(document.getText(), stale)
  })

  it('stopping restores the preview', async () => {
    await vscode.commands.executeCommand('codeurjc-slidev.stopInspectingGeometry')
    await waitFor(async () => {
      const s = await previewState()
      return !s.inspected && s.highlighted === 0
    }, 'the preview to leave inspection')
  })
})
