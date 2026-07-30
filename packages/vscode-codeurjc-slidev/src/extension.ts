// Thin vscode-API adapter wiring the pure logic modules (documentScan,
// markerDecorations, importAnalysis, referenceIndex/*) to real editor
// behavior: decorations, hovers, diagnostics, and CodeLens. Deliberately kept
// thin -- the logic it calls into is unit tested; this file's own correctness
// is covered by the extension-host smoke tests in test-extension/.

import * as vscode from 'vscode'
import { readFileSync } from 'node:fs'
import { usesCodeurjcSlidevTheme } from './themeGate'
import { computeMarkerDecorations } from './markerDecorations'
import { analyzeImports, type ResolveImport } from './importAnalysis'
import { buildReferenceIndex, updateReferenceIndexForFile, type ReferenceIndex } from './referenceIndex/indexBuilder'
import { computeCodeLensesForDocument, type ReferenceMention } from './referenceIndex/codeLens'
import { readThemeTaggedMarkdownFiles, makeResolveImportPath, findProjectRoot, resolveImportTarget } from './referenceIndex/scanner'
import { makeClassifySourceLink } from './sourceLinkDiagnostics'

const dimDecorationType = vscode.window.createTextEditorDecorationType({ opacity: '0.4' })
const highlightDecorationType = vscode.window.createTextEditorDecorationType({
  backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
  border: '1px solid',
  borderColor: new vscode.ThemeColor('editor.findMatchBorder'),
})

function isRelevantDocument(document: vscode.TextDocument): boolean {
  return document.languageId === 'markdown' && usesCodeurjcSlidevTheme(document.getText())
}

function toRange(startLine: number, startChar: number, endLine: number, endChar: number): vscode.Range {
  return new vscode.Range(new vscode.Position(startLine, startChar), new vscode.Position(endLine, endChar))
}

function updateDecorations(editor: vscode.TextEditor): void {
  if (!isRelevantDocument(editor.document)) {
    editor.setDecorations(dimDecorationType, [])
    editor.setDecorations(highlightDecorationType, [])
    return
  }
  const { dims, highlights } = computeMarkerDecorations(editor.document.getText())
  editor.setDecorations(dimDecorationType, dims.map(d => toRange(d.line, d.startChar, d.line, d.endChar)))
  editor.setDecorations(highlightDecorationType, highlights.map((h) => {
    if (h.substringRange) return toRange(h.startLine, h.substringRange.start, h.startLine, h.substringRange.end)
    const endLineLength = editor.document.lineAt(h.endLine).text.length
    return toRange(h.startLine, 0, h.endLine, endLineLength)
  }))
}

/** Builds a `ResolveImport` (file-text-reading) callback scoped to a specific markdown document's project root. Escaping the code root is reported (via `escapesCodeRoot`), not treated as a resolution failure -- the theme still reads/renders the file in that case. */
function createFsResolveImport(mdDocumentPath: string): ResolveImport {
  const projectRoot = findProjectRoot(mdDocumentPath)
  return (importFilePath) => {
    const { absPath, escapesCodeRoot } = resolveImportTarget(importFilePath, mdDocumentPath, projectRoot)
    try {
      return { targetAbsPath: absPath, fileText: readFileSync(absPath, 'utf-8'), escapesCodeRoot }
    }
    catch {
      return null
    }
  }
}

const classifySourceLink = makeClassifySourceLink()

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection('codeurjc-slidev')
  context.subscriptions.push(diagnostics)

  function refreshDocument(document: vscode.TextDocument): void {
    if (!isRelevantDocument(document)) {
      diagnostics.delete(document.uri)
      return
    }
    const { diagnostics: found } = analyzeImports(document.getText(), createFsResolveImport(document.uri.fsPath), classifySourceLink)
    diagnostics.set(document.uri, found.map(d => new vscode.Diagnostic(
      toRange(d.line, 0, d.line, document.lineAt(d.line).text.length),
      d.message,
      d.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning,
    )))
  }

  for (const editor of vscode.window.visibleTextEditors) updateDecorations(editor)
  for (const document of vscode.workspace.textDocuments) refreshDocument(document)

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => { if (editor) updateDecorations(editor) }),
    vscode.workspace.onDidOpenTextDocument((document) => refreshDocument(document)),
    vscode.workspace.onDidChangeTextDocument((event) => {
      const editor = vscode.window.visibleTextEditors.find(e => e.document === event.document)
      if (editor) updateDecorations(editor)
      refreshDocument(event.document)
    }),
  )

  const hoverProvider = vscode.languages.registerHoverProvider('markdown', {
    provideHover(document, position) {
      if (!isRelevantDocument(document)) return undefined
      const { hovers } = analyzeImports(document.getText(), createFsResolveImport(document.uri.fsPath))
      const hits = hovers.filter(h => h.line === position.line)
      if (hits.length === 0) return undefined
      return new vscode.Hover(hits.map(h => h.contents).join('\n\n'))
    },
  })
  context.subscriptions.push(hoverProvider)

  // --- Reference index + CodeLens -----------------------------------------

  let referenceIndex: ReferenceIndex = new Map()
  const codeLensChangeEmitter = new vscode.EventEmitter<void>()
  context.subscriptions.push(codeLensChangeEmitter)

  function resolveImportPathForFile(mdPath: string, importFilePath: string): string | null {
    return makeResolveImportPath(findProjectRoot(mdPath))(mdPath, importFilePath)
  }

  function rebuildIndexForWorkspace(): void {
    referenceIndex = new Map()
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const files = readThemeTaggedMarkdownFiles(folder.uri.fsPath)
      const partial = buildReferenceIndex(files, resolveImportPathForFile)
      for (const [target, recipes] of partial) {
        const existing = referenceIndex.get(target)
        referenceIndex.set(target, existing ? [...existing, ...recipes] : recipes)
      }
    }
    codeLensChangeEmitter.fire()
  }
  rebuildIndexForWorkspace()

  function slideTextByFile(slideFile: string): string | null {
    const open = vscode.workspace.textDocuments.find(d => d.uri.fsPath === slideFile)
    if (open) return open.getText()
    try {
      return readFileSync(slideFile, 'utf-8')
    }
    catch {
      return null
    }
  }

  const codeLensProvider: vscode.CodeLensProvider = {
    onDidChangeCodeLenses: codeLensChangeEmitter.event,
    provideCodeLenses(document) {
      const lenses = computeCodeLensesForDocument(referenceIndex, document.uri.fsPath, document.getText(), slideTextByFile)
      return lenses.map(l => new vscode.CodeLens(
        toRange(l.line, 0, l.line, 0),
        { title: l.title, command: 'codeurjc-slidev.openReference', arguments: [l.references] },
      ))
    },
  }
  context.subscriptions.push(vscode.languages.registerCodeLensProvider({ pattern: '**/*' }, codeLensProvider))

  async function openReference(reference: ReferenceMention): Promise<void> {
    const document = await vscode.workspace.openTextDocument(reference.slideFile)
    const editor = await vscode.window.showTextDocument(document)
    const position = new vscode.Position(reference.slideLine, 0)
    editor.selection = new vscode.Selection(position, position)
    editor.revealRange(new vscode.Range(position, position))
  }

  context.subscriptions.push(vscode.commands.registerCommand('codeurjc-slidev.openReference', async (references: ReferenceMention[]) => {
    if (references.length === 1) {
      await openReference(references[0])
      return
    }
    const picked = await vscode.window.showQuickPick(
      references.map(r => ({
        label: `Slide ${r.slideNumber}`,
        description: r.comment || undefined,
        detail: r.slideFile,
        reference: r,
      })),
      { placeHolder: 'Multiple slides reference this line -- pick one to open' },
    )
    if (picked) await openReference(picked.reference)
  }))

  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
    if (isRelevantDocument(event.document)) {
      updateReferenceIndexForFile(referenceIndex, event.document.uri.fsPath, event.document.getText(), resolveImportPathForFile)
    }
    codeLensChangeEmitter.fire()
  }))
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument((document) => {
    if (isRelevantDocument(document)) {
      updateReferenceIndexForFile(referenceIndex, document.uri.fsPath, document.getText(), resolveImportPathForFile)
      codeLensChangeEmitter.fire()
    }
  }))
  context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(() => rebuildIndexForWorkspace()))
}

export function deactivate(): void {}
