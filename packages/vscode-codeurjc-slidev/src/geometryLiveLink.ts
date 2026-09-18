// Thin vscode adapter for the geometry live link: attaches to a running dev
// server, highlights the geometry entry under the cursor in whatever preview
// is open, and applies drags made there to the open document. The decisions
// live in geometry/liveLink.ts and geometry/applyDrag.ts, which are unit
// tested; like extension.ts, this file is covered by the extension-host smoke
// tests.

import type { InspectEntryRef, InspectEvent } from 'codeurjc-slidev-theme/composables/useInspectProtocol'
import * as vscode from 'vscode'
import { applyDrag } from './geometry/applyDrag'
import { DevServerLink } from './geometry/devServer'
import { deckMatches, geometryEntryAt, sameEntry } from './geometry/liveLink'
import { findProjectRoot } from './referenceIndex/scanner'
import { usesCodeurjcSlidevTheme } from './themeGate'

const COMPANION_ID = 'antfu.slidev'

function config() {
  const c = vscode.workspace.getConfiguration('codeurjcSlidev')
  return {
    serverUrl: c.get<string>('devServer.url', 'http://localhost:3030'),
    saveOnDrag: c.get<boolean>('geometry.saveOnDrag', true),
  }
}

/**
 * The preview comes from the official Slidev extension (or a browser tab), so
 * it's recommended rather than required: everything that needs no preview
 * works without it. Prompts once per session, and never blocks.
 */
let companionPrompted = false
async function promptForCompanion(): Promise<void> {
  if (companionPrompted || vscode.extensions.getExtension(COMPANION_ID))
    return
  companionPrompted = true
  const install = 'Install Slidev extension'
  const choice = await vscode.window.showInformationMessage(
    'Geometry inspection shows in a Slidev preview. The official Slidev extension provides one inside VS Code; a browser tab on the dev server works too.',
    install,
  )
  if (choice === install)
    await vscode.commands.executeCommand('workbench.extensions.installExtension', COMPANION_ID)
}

export function registerGeometryLiveLink(context: vscode.ExtensionContext): void {
  let link: DevServerLink | null = null
  let document: vscode.TextDocument | null = null
  /** The deck the preview last announced, and whether it's `document`. */
  let deckOk = false
  let announced: string | null = null
  let lastHighlight: InspectEntryRef | null = null

  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50)
  status.command = 'codeurjc-slidev.stopInspectingGeometry'
  context.subscriptions.push(status)

  function paint(): void {
    if (!link) {
      status.hide()
      return
    }
    if (deckOk) {
      status.text = '$(eye) Geometry: linked'
      status.tooltip = `Inspecting geometry of ${vscode.workspace.asRelativePath(document!.uri)} in the preview. Click to stop.`
    }
    else if (announced) {
      status.text = '$(warning) Geometry: preview shows another deck'
      status.tooltip = `The dev server is showing ${announced}, not ${vscode.workspace.asRelativePath(document!.uri)}. Nothing is sent or applied until they match. Click to stop.`
    }
    else {
      status.text = '$(sync~spin) Geometry: waiting for a preview'
      status.tooltip = `Attached to ${link.baseUrl}; open the deck in a preview. Click to stop.`
    }
    status.show()
  }

  function stop(): void {
    const current = link
    link = null
    if (current) {
      void current.send({ type: 'inspect', on: false })
      void current.send({ type: 'control', on: false })
      current.dispose()
    }
    document = null
    deckOk = false
    announced = null
    lastHighlight = null
    paint()
  }

  async function onDrag(event: Extract<InspectEvent, { type: 'drag' }>): Promise<void> {
    if (!document || !deckOk)
      return
    const outcome = applyDrag(document.getText(), event)
    if (outcome.kind === 'gone') {
      void vscode.window.showWarningMessage('That geometry entry is no longer in the file, so the drag was not applied.')
      return
    }
    if (outcome.kind === 'drift') {
      const save = 'Save and re-sync'
      const choice = await vscode.window.showWarningMessage(
        `The preview is stale: slide ${event.slideNo} there is slide ${outcome.foundOnSlide} in the editor, because of unsaved changes. The drag was not applied.`,
        save,
      )
      if (choice === save)
        await document.save()
      return
    }
    if (outcome.edits.length === 0)
      return
    // One edit, so the editor's own undo reverses a drag; applied into the
    // live buffer rather than the file, so unsaved changes are kept.
    const edit = new vscode.WorkspaceEdit()
    for (const e of outcome.edits)
      edit.replace(document.uri, new vscode.Range(e.startLine, e.startChar, e.endLine, e.endChar), e.newText)
    if (!await vscode.workspace.applyEdit(edit))
      return
    // Saved once, together with any other pending changes, so the dev server
    // reloads and the preview shows the result.
    if (config().saveOnDrag)
      await document.save()
  }

  function onEvent(event: InspectEvent): void {
    if (event.type === 'deck') {
      announced = event.entry
      deckOk = !!document && deckMatches(event.entry, findProjectRoot(document.uri.fsPath), document.uri.fsPath)
      paint()
      return
    }
    void onDrag(event)
  }

  async function start(): Promise<void> {
    const editor = vscode.window.activeTextEditor
    if (!editor || editor.document.languageId !== 'markdown' || !usesCodeurjcSlidevTheme(editor.document.getText())) {
      void vscode.window.showWarningMessage('Open a slides file that uses codeurjc-slidev-theme first.')
      return
    }
    stop()
    void promptForCompanion()
    const { serverUrl } = config()
    const next = new DevServerLink(serverUrl, onEvent, () => {
      if (link === next)
        stop()
    })
    if (!await next.attach()) {
      void vscode.window.showWarningMessage(`No Slidev dev server answered at ${serverUrl}. Start it (e.g. from the Slidev extension's preview) or set codeurjcSlidev.devServer.url.`)
      return
    }
    link = next
    document = editor.document
    paint()
    await link.send({ type: 'control', on: true })
    await link.send({ type: 'inspect', on: true })
    highlightAt(editor)
  }

  function highlightAt(editor: vscode.TextEditor): void {
    if (!link || !deckOk || editor.document !== document)
      return
    const entry = geometryEntryAt(editor.document.getText(), editor.selection.active.line)
    if (sameEntry(entry, lastHighlight))
      return
    lastHighlight = entry
    void link.send({ type: 'highlight', entry })
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('codeurjc-slidev.inspectGeometry', start),
    vscode.commands.registerCommand('codeurjc-slidev.stopInspectingGeometry', stop),
    vscode.window.onDidChangeTextEditorSelection(e => highlightAt(e.textEditor)),
    vscode.workspace.onDidCloseTextDocument((closed) => {
      if (closed === document)
        stop()
    }),
    { dispose: stop },
  )
}
