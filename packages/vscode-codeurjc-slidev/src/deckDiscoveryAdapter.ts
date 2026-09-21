// Thin vscode adapter for deck discovery: finds the workspace's decks, offers
// to register the ones the Slidev extension (`antfu.slidev`) doesn't know in
// its `slidev.include` setting, remembers the deck last edited so it can be the
// default, and shows a one-time tip about switching decks. The decisions live
// in deckDiscovery.ts, includePlan.ts and deckTip.ts, which are unit tested;
// like extension.ts, this file is covered by the extension-host smoke tests.

import { readFileSync } from 'node:fs'
import { relative, sep } from 'node:path'
import * as vscode from 'vscode'
import { classifyDocument, groupDecksByProject } from './deckDiscovery'
import { DECK_TIP_MESSAGE, shouldShowDeckTip } from './deckTip'
import { deckSetKey, missingDecks, planInclude, shouldOfferRegistration } from './includePlan'
import { findMarkdownFiles, findProjectRoot } from './referenceIndex/scanner'
import { usesCodeurjcSlidevTheme } from './themeGate'

const LAST_EDITED_KEY = 'deckDiscovery.lastEdited'
const DECLINED_KEY = 'deckDiscovery.declined'
const TIP_SHOWN_KEY = 'deckDiscovery.tipShown'

const normalize = (path: string): string => path.split(sep).join('/')

function enabled(): boolean {
  return vscode.workspace.getConfiguration('codeurjcSlidev').get<boolean>('deckDiscovery.enabled', true)
}

/** Every deck under the workspace folders, as absolute paths (`/` separated), each with the folder it is relative to. */
function scanDecks(): { abs: string, folder: string }[] {
  const decks: { abs: string, folder: string }[] = []
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const root = folder.uri.fsPath
    for (const path of findMarkdownFiles(root)) {
      let text: string
      try {
        text = readFileSync(path, 'utf-8')
      }
      catch {
        continue
      }
      if (classifyDocument(path, text) === 'deck')
        decks.push({ abs: normalize(path), folder: root })
    }
  }
  return decks
}

/** The files the Slidev extension will register from `slidev.include`, resolved by VS Code's own glob matching. */
async function registeredFiles(): Promise<Set<string>> {
  const slidev = vscode.workspace.getConfiguration('slidev')
  const exclude = slidev.get<string>('exclude')
  const registered = new Set<string>()
  for (const pattern of slidev.get<string[]>('include', [])) {
    for (const uri of await vscode.workspace.findFiles(pattern, exclude || undefined))
      registered.add(normalize(uri.fsPath))
  }
  return registered
}

export interface DeckDiscoveryApi {
  /** Test hook: whether the multi-deck tip has been shown in this workspace. */
  deckTipShown: () => boolean
  /** Test hook: forget that the tip was shown. */
  resetDeckTip: () => Thenable<void>
}

export function registerDeckDiscovery(context: vscode.ExtensionContext): DeckDiscoveryApi {
  const state = context.workspaceState
  let decks: { abs: string, folder: string }[] | null = null
  let offering = false
  // Read and set synchronously: two editor events for one open can both reach the check before a stored flag lands.
  let tipShown = state.get<boolean>(TIP_SHOWN_KEY, false)

  const getDecks = () => decks ??= scanDecks()

  function projectDeckCount(deckPath: string): number {
    const root = findProjectRoot(deckPath)
    const groups = groupDecksByProject(getDecks().map(d => d.abs), p => normalize(findProjectRoot(p)))
    return groups.get(normalize(root))?.length ?? 0
  }

  async function offerRegistration(): Promise<void> {
    if (offering || !enabled())
      return
    const slidev = vscode.workspace.getConfiguration('slidev')
    // Without the Slidev extension installed its setting isn't registered, and there is nothing to register with.
    if (slidev.inspect('include') === undefined)
      return
    offering = true
    try {
      const registered = await registeredFiles()
      const all = getDecks()
      const missingAbs = missingDecks(all.map(d => d.abs), registered)
      const missing = all
        .filter(d => missingAbs.includes(d.abs))
        .map(d => normalize(relative(d.folder, d.abs)))
      const unique = [...new Set(missing)]
      if (!shouldOfferRegistration(unique, state.get<string>(DECLINED_KEY)))
        return

      const register = 'Register'
      const choice = await vscode.window.showInformationMessage(
        `${unique.length} slide deck${unique.length === 1 ? '' : 's'} in this workspace ${unique.length === 1 ? 'isn\'t' : 'aren\'t'} known to the Slidev extension yet. Register ${unique.length === 1 ? 'it' : 'them'} so the Slidev sidebar and preview can use ${unique.length === 1 ? 'it' : 'them'}?`,
        register,
        'Not now',
      )
      if (choice !== register) {
        await state.update(DECLINED_KEY, deckSetKey(unique))
        return
      }
      const lastEditedAbs = state.get<string>(LAST_EDITED_KEY)
      const lastEdited = all.find(d => d.abs === lastEditedAbs)
      const lastEditedRel = lastEdited ? normalize(relative(lastEdited.folder, lastEdited.abs)) : undefined
      const next = planInclude(unique, lastEditedRel, slidev.get<string[]>('include', []))
      await slidev.update('include', next, vscode.ConfigurationTarget.Workspace)
    }
    catch (error) {
      void vscode.window.showErrorMessage(`Could not register the slide decks with the Slidev extension: ${error instanceof Error ? error.message : String(error)}`)
    }
    finally {
      offering = false
    }
  }

  async function maybeShowTip(document: vscode.TextDocument | undefined): Promise<void> {
    if (!document || document.languageId !== 'markdown' || !usesCodeurjcSlidevTheme(document.getText()))
      return
    const isDeck = classifyDocument(document.uri.fsPath, document.getText()) === 'deck'
    if (!shouldShowDeckTip({
      isDeck,
      decksInProject: isDeck ? projectDeckCount(document.uri.fsPath) : 0,
      alreadyShown: tipShown,
      enabled: enabled(),
    })) {
      return
    }
    // Recorded before showing, so closing the notification counts as seeing it.
    tipShown = true
    await state.update(TIP_SHOWN_KEY, true)
    const choose = 'Choose deck…'
    const choice = await vscode.window.showInformationMessage(DECK_TIP_MESSAGE, choose, 'Don\'t show again')
    if (choice === choose) {
      try {
        await vscode.commands.executeCommand('slidev.choose-entry')
      }
      catch {
        void vscode.window.showWarningMessage('The Slidev extension isn\'t available: install it (antfu.slidev) to choose the active deck.')
      }
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined
  function decksChanged(): void {
    decks = null
    clearTimeout(timer)
    timer = setTimeout(() => void offerRegistration(), 500)
  }

  const watcher = vscode.workspace.createFileSystemWatcher('**/*.md')
  context.subscriptions.push(
    watcher,
    watcher.onDidCreate(decksChanged),
    watcher.onDidDelete(decksChanged),
    { dispose: () => clearTimeout(timer) },
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.languageId === 'markdown')
        decksChanged()
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(decksChanged),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('slidev.include') || event.affectsConfiguration('slidev.exclude') || event.affectsConfiguration('codeurjcSlidev.deckDiscovery'))
        void offerRegistration()
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      const { document } = event
      if (document.languageId === 'markdown' && event.contentChanges.length > 0 && classifyDocument(document.uri.fsPath, document.getText()) === 'deck')
        void state.update(LAST_EDITED_KEY, normalize(document.uri.fsPath))
    }),
    vscode.window.onDidChangeActiveTextEditor(editor => void maybeShowTip(editor?.document)),
  )

  void offerRegistration()
  void maybeShowTip(vscode.window.activeTextEditor?.document)

  return {
    deckTipShown: () => tipShown,
    resetDeckTip: () => {
      tipShown = false
      return state.update(TIP_SHOWN_KEY, undefined)
    },
  }
}
