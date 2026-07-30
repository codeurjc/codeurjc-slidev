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
import { readThemeTaggedMarkdownFiles, makeResolveImportPath, findProjectRoot, resolveImportTarget, listCodeRootDirectory } from './referenceIndex/scanner'
import { makeResolveSourceLink } from './sourceLinkDiagnostics'
import { computeImportPathContext, filterPathEntries } from './pathCompletion'
import { computeSelectorForSelection } from './selectorFromSelection'
import { parseSnippetImportLine, parseSnippetSelector, serializeSnippetSelector } from 'codeurjc-slidev-theme/composables/useSnippetImport'

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

const resolveSourceLink = makeResolveSourceLink()

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection('codeurjc-slidev')
  context.subscriptions.push(diagnostics)

  function refreshDocument(document: vscode.TextDocument): void {
    if (!isRelevantDocument(document)) {
      diagnostics.delete(document.uri)
      return
    }
    const { diagnostics: found } = analyzeImports(document.getText(), createFsResolveImport(document.uri.fsPath), resolveSourceLink)
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
      const { hovers } = analyzeImports(document.getText(), createFsResolveImport(document.uri.fsPath), resolveSourceLink)
      const hits = hovers.filter(h => h.line === position.line)
      if (hits.length === 0) return undefined
      return new vscode.Hover(hits.map(h => h.contents).join('\n\n'))
    },
  })
  context.subscriptions.push(hoverProvider)

  const importCodeLensProvider = vscode.languages.registerCodeLensProvider('markdown', {
    provideCodeLenses(document) {
      if (!isRelevantDocument(document)) return []
      const { codeLensActions } = analyzeImports(document.getText(), createFsResolveImport(document.uri.fsPath), resolveSourceLink)
      return codeLensActions.flatMap((action) => {
        const range = toRange(action.line, 0, action.line, 0)
        const lenses = [new vscode.CodeLens(range, {
          title: 'Open imported file',
          command: 'codeurjc-slidev.openImportedFile',
          arguments: [action.openFile],
        })]
        if (action.openSourceUrl) {
          lenses.push(new vscode.CodeLens(range, {
            title: 'Open source ↗',
            command: 'codeurjc-slidev.openImportSource',
            arguments: [action.openSourceUrl],
          }))
        }
        return lenses
      })
    },
  })
  context.subscriptions.push(importCodeLensProvider)

  context.subscriptions.push(vscode.commands.registerCommand('codeurjc-slidev.openImportedFile', async (openFile: { absPath: string, startLine: number, endLine: number, isWholeFile: boolean }) => {
    const document = await vscode.workspace.openTextDocument(openFile.absPath)
    const editor = await vscode.window.showTextDocument(document)
    if (!openFile.isWholeFile) {
      const range = toRange(openFile.startLine - 1, 0, openFile.endLine - 1, document.lineAt(openFile.endLine - 1).text.length)
      editor.selection = new vscode.Selection(range.start, range.end)
      editor.revealRange(range)
    }
  }))

  context.subscriptions.push(vscode.commands.registerCommand('codeurjc-slidev.openImportSource', async (url: string) => {
    await vscode.env.openExternal(vscode.Uri.parse(url))
  }))

  const pathCompletionProvider = vscode.languages.registerCompletionItemProvider('markdown', {
    provideCompletionItems(document, position) {
      if (!isRelevantDocument(document)) return undefined
      const linePrefix = document.lineAt(position.line).text.slice(0, position.character)
      const ctx = computeImportPathContext(linePrefix)
      if (!ctx) return undefined
      const projectRoot = findProjectRoot(document.uri.fsPath)
      const entries = filterPathEntries(listCodeRootDirectory(projectRoot, ctx.dirRelPath), ctx.segmentPrefix)
      const replaceRange = new vscode.Range(position.translate(0, -ctx.segmentPrefix.length), position)
      return entries.map((entry) => {
        const item = new vscode.CompletionItem(entry.name, entry.isDirectory ? vscode.CompletionItemKind.Folder : vscode.CompletionItemKind.File)
        item.insertText = entry.isDirectory ? `${entry.name}/` : entry.name
        item.range = replaceRange
        if (entry.isDirectory) item.command = { command: 'editor.action.triggerSuggest', title: '' }
        return item
      })
    },
  }, '/')
  context.subscriptions.push(pathCompletionProvider)

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

  // --- Selector copy/paste commands ---------------------------------------

  context.subscriptions.push(vscode.commands.registerCommand('codeurjc-slidev.copySelectorForSelection', async () => {
    const editor = vscode.window.activeTextEditor
    if (!editor || editor.selection.isEmpty) {
      vscode.window.showErrorMessage('Select one or more lines first to copy a Slidev selector.')
      return
    }
    const fileLines = editor.document.getText().split('\n')
    const startLine = editor.selection.start.line + 1 // 1-based, matching the <<< grammar
    // A whole-line selection (gutter click, Shift+Down) typically lands
    // `end` at column 0 of the line *after* the last intended line -- treat
    // that as not actually including that trailing line.
    const endsAtLineStart = editor.selection.end.character === 0 && editor.selection.end.line > editor.selection.start.line
    const endLine = editor.selection.end.line + (endsAtLineStart ? 0 : 1)
    const selectorRaw = computeSelectorForSelection(fileLines, { startLine, endLine })
    await vscode.env.clipboard.writeText(`[${selectorRaw}]`)
    vscode.window.showInformationMessage(`Copied Slidev selector: [${selectorRaw}]`)
  }))

  context.subscriptions.push(vscode.commands.registerCommand('codeurjc-slidev.pasteSelectorIntoImport', async () => {
    const editor = vscode.window.activeTextEditor
    if (!editor) return
    const line = editor.document.lineAt(editor.selection.active.line)
    if (!parseSnippetImportLine(line.text)) {
      vscode.window.showErrorMessage('Place the cursor on a <<< import line first.')
      return
    }

    const clipboardText = (await vscode.env.clipboard.readText()).trim()
    const bracketMatch = /^\[([\s\S]*)\]$/.exec(clipboardText)
    const selectorRaw = bracketMatch ? bracketMatch[1] : clipboardText
    if (!parseSnippetSelector(selectorRaw)) {
      vscode.window.showErrorMessage(`Clipboard content is not a valid Slidev selector: ${clipboardText}`)
      return
    }

    const newLineText = serializeSnippetSelector(line.text, selectorRaw)
    if (newLineText === null) {
      vscode.window.showErrorMessage('Could not update the import line.')
      return
    }
    await editor.edit((builder) => { builder.replace(line.range, newLineText) })
  }))
}

export function deactivate(): void {}
