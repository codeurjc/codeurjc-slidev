// The slide client's end of the controller channel (see useInspectProtocol.ts
// for why the channel runs over the dev server): which inspection state an
// external controller has asked for, and the way back to it.
//
// Installed once per page, from global-top.vue; the layout reads the shared
// state below and emits drags through `emitInspectEvent`.

import type { InspectCommand, InspectEntryRef, InspectEvent } from './useInspectProtocol'
import { ref } from 'vue'
import { setControllerEditing } from './useEditor'
import { INSPECT_CLIENT_EVENT, INSPECT_COMMAND_EVENT, INSPECT_SYNC_EVENT, parseInspectCommand } from './useInspectProtocol'

/** Outlines every geometry entry. Inspection implies editor mode, so drag handles show too. */
export const inspecting = ref(false)
/** The controller holds geometry writes: drags are emitted to it rather than written to frontmatter. */
export const controlled = ref(false)
/** The one entry the controller wants singled out, e.g. the one under the author's cursor. */
export const highlighted = ref<InspectEntryRef | null>(null)

export interface InspectClientDeps {
  setEditing: (on: boolean) => void
  /** Answers `whichDeck`. */
  announceDeck: () => void
}

/** Applies one controller command to the shared state. */
export function applyInspectCommand(command: InspectCommand, deps: InspectClientDeps): void {
  switch (command.type) {
    case 'inspect':
      inspecting.value = command.on
      deps.setEditing(command.on)
      if (!command.on)
        highlighted.value = null
      break
    case 'control':
      controlled.value = command.on
      break
    case 'highlight':
      highlighted.value = command.entry
      break
    case 'whichDeck':
      deps.announceDeck()
      break
  }
}

interface HotChannel {
  on: (event: string, cb: (data: unknown) => void) => void
  send: (event: string, data?: unknown) => void
}

function hot(): HotChannel | undefined {
  return import.meta.hot as HotChannel | undefined
}

/** Sends an event to every attached controller. A no-op outside the dev server. */
export function emitInspectEvent(event: InspectEvent): void {
  hot()?.send(INSPECT_CLIENT_EVENT, event)
}

let installed = false

/**
 * Listens for controller commands. `deckPath` answers which deck this page is
 * showing -- the entry file's path as Slidev reports it for slide 1.
 */
export function installInspectClient(deckPath: () => string | null | undefined): void {
  const channel = hot()
  if (installed || !channel)
    return
  installed = true
  const deps: InspectClientDeps = {
    setEditing: setControllerEditing,
    announceDeck: () => {
      const entry = deckPath()
      if (entry)
        emitInspectEvent({ type: 'deck', entry })
    },
  }
  channel.on(INSPECT_COMMAND_EVENT, (raw) => {
    const command = parseInspectCommand(raw)
    if (command)
      applyInspectCommand(command, deps)
  })
  // A page loaded after the controller attached would otherwise miss the
  // commands already sent; ask the server to replay the current state.
  channel.send(INSPECT_SYNC_EVENT)
}
