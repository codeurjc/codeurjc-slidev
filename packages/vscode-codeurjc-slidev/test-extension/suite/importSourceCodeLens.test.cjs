const assert = require('node:assert')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { rmSync } = require('node:fs')
const vscode = require('vscode')

function fixtureRoot() {
  const folder = vscode.workspace.workspaceFolders?.[0]
  assert.ok(folder, 'no fixture workspace folder open')
  return folder.uri.fsPath
}

const fixturePath = path.resolve(__dirname, '..', 'fixture')

// Root-level (not nested in any `describe`) hooks attach to Mocha's shared
// root suite, running once before/after the *entire* run across every file
// `index.cjs` loads -- required here, not just file-scoped, because the
// extension's own background analysis (document-open listeners) resolves
// the source link for the fixture's Foo.java as soon as *any* earlier test
// opens slides.md, and `resolveRepoLinkInfoCached` caches that answer for
// the process's lifetime. The git repo below must exist before that first
// resolution happens, or every test in this run would see a cached
// "no-repo" answer regardless of what this file does on its own.
before(() => {
  // A throwaway git repo with a GitHub origin remote and an explicit
  // default-branch symref, so `resolveSourceLink` actually resolves a URL --
  // set up/torn down here rather than committed as a literal `.git`
  // directory (which git itself won't track as plain file content anyway).
  execFileSync('git', ['init', '-q'], { cwd: fixturePath })
  execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/codeurjc/codeurjc-slidev-fixture.git'], { cwd: fixturePath })
  execFileSync('git', ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main'], { cwd: fixturePath })
})

after(() => {
  rmSync(path.join(fixturePath, '.git'), { recursive: true, force: true })
})

describe('Import CodeLens ("Open imported file" / "Open source")', () => {
  it('shows both "Open imported file" and "Open source" lenses on the <<< import line', async () => {
    const slidesUri = vscode.Uri.file(path.join(fixtureRoot(), 'slides.md'))
    const document = await vscode.workspace.openTextDocument(slidesUri)
    await vscode.window.showTextDocument(document)

    const importLineIdx = document.getText().split('\n').findIndex(l => l.startsWith('<<< @/code/Foo.java'))
    assert.ok(importLineIdx >= 0, 'fixture should contain the Foo.java import line')

    const lenses = await vscode.commands.executeCommand('vscode.executeCodeLensProvider', document.uri)
    const importLenses = lenses.filter(l => l.range.start.line === importLineIdx)
    const titles = importLenses.map(l => l.command?.title)

    assert.ok(titles.includes('Open imported file'), `expected an "Open imported file" lens, got: ${JSON.stringify(titles)}`)
    assert.ok(titles.some(t => t?.startsWith('Open source')), `expected an "Open source" lens, got: ${JSON.stringify(titles)}`)

    const sourceLens = importLenses.find(l => l.command?.title?.startsWith('Open source'))
    assert.strictEqual(sourceLens.command.command, 'codeurjc-slidev.openImportSource')
    assert.ok(sourceLens.command.arguments[0].startsWith('https://github.com/codeurjc/codeurjc-slidev-fixture/blob/main/code/Foo.java'))
  })
})
