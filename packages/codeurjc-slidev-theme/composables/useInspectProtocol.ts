// The message shapes an external controller (the VS Code extension) and the
// theme exchange over the dev server.
//
// Why a dev-server channel rather than the page URL or Slidev's own embedded
// `postMessage` protocol: an embedded preview's iframe URL is built by
// whoever embeds it (the official Slidev extension writes
// `<server>/<n>?embedded=true` itself), and its relay only forwards
// `target: 'slidev'` messages, which `useEmbeddedCtrl` handles and which know
// nothing about the theme. Slidev's own "Show editor" button is hidden in
// embedded mode, and `showEditor`'s localStorage is partitioned away from a
// normal browser tab. So the only channel that reaches the theme in any
// preview is the one the theme's own Vite plugin owns.
//
// Pure: message shapes plus parsing and validation, no transport. The Vite
// plugin carries these over HTTP + server-sent events on one side and Vite's
// HMR custom events on the other; `layouts/default.vue` acts on them.

/** Where a geometry entry lives, as both sides name it. */
export type InspectCollection = 'content' | 'images' | 'elements'

/** One entry's address: its slide, its collection and its index within that collection. */
export interface InspectEntryRef {
  slideNo: number
  collection: InspectCollection
  /** Index within the collection; always 0 for `content`, which is singular. */
  index: number
}

/** A rect in slide-canvas pixels -- the same space `geometry` and the `--ed-*` variables use. */
export interface InspectRect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * What a drag names the element it moved: its own stable key, never its list
 * position. `geometry.elements` matches by key and never by position, and a
 * controller may be applying the drag to a document that has gained or lost
 * entries since the preview rendered -- an index would silently hit the wrong
 * entry, a key cannot.
 */
export type InspectKey
  = | { kind: 'content' }
    | { kind: 'image', ref: string }
    | { kind: 'code', text: string }
    | { kind: 'id', name: string }

/** Controller → theme. */
export type InspectCommand
  = | { type: 'inspect', on: boolean }
    | { type: 'highlight', entry: InspectEntryRef | null }
  /** Claim or release geometry writes. While claimed, the theme emits drags instead of writing frontmatter. */
    | { type: 'control', on: boolean }
  /**
   * Asks every connected client to announce the deck it is showing. Vite's
   * resolved config carries the theme-facing `slidev` plugin options, not
   * Slidev's resolved entry, so the deck's identity comes from the client --
   * which knows its own slide's source file, the same thing the callout
   * position write-back already relies on.
   */
    | { type: 'whichDeck' }

/** Theme → controller. */
export type InspectEvent
  = | { type: 'drag', slideNo: number, key: InspectKey, from: InspectRect, to: InspectRect }
  /**
   * A client's answer to `whichDeck`: the deck it is showing, as Slidev
   * reports slide 1's source file (absolute, or relative to the project root). A controller compares it against the
   * document it has open and refuses to address slide numbers until they
   * agree -- a course is typically one deck per lecture, so slide 14 of
   * `tema1.md` and of `tema2.md` are unrelated slides.
   */
    | { type: 'deck', entry: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseRect(raw: unknown): InspectRect | null {
  if (!isRecord(raw))
    return null
  const out: Record<string, number> = {}
  for (const field of ['x', 'y', 'w', 'h'] as const) {
    const v = raw[field]
    if (typeof v !== 'number' || !Number.isFinite(v))
      return null
    out[field] = v
  }
  return out as unknown as InspectRect
}

const COLLECTIONS: InspectCollection[] = ['content', 'images', 'elements']

export function parseEntryRef(raw: unknown): InspectEntryRef | null {
  if (!isRecord(raw))
    return null
  const { slideNo, collection, index } = raw
  if (typeof slideNo !== 'number' || !Number.isInteger(slideNo) || slideNo < 1)
    return null
  if (typeof collection !== 'string' || !COLLECTIONS.includes(collection as InspectCollection))
    return null
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0)
    return null
  return { slideNo, collection: collection as InspectCollection, index }
}

export function parseInspectKey(raw: unknown): InspectKey | null {
  if (!isRecord(raw))
    return null
  switch (raw.kind) {
    case 'content':
      return { kind: 'content' }
    case 'image':
      return typeof raw.ref === 'string' && raw.ref !== '' ? { kind: 'image', ref: raw.ref } : null
    case 'code':
      return typeof raw.text === 'string' && raw.text !== '' ? { kind: 'code', text: raw.text } : null
    case 'id':
      return typeof raw.name === 'string' && raw.name !== '' ? { kind: 'id', name: raw.name } : null
    default:
      return null
  }
}

/** Reads a controller command, or null when it is malformed. */
export function parseInspectCommand(raw: unknown): InspectCommand | null {
  if (!isRecord(raw))
    return null
  switch (raw.type) {
    case 'inspect':
      return typeof raw.on === 'boolean' ? { type: 'inspect', on: raw.on } : null
    case 'control':
      return typeof raw.on === 'boolean' ? { type: 'control', on: raw.on } : null
    case 'whichDeck':
      return { type: 'whichDeck' }
    case 'highlight': {
      if (raw.entry === null)
        return { type: 'highlight', entry: null }
      const entry = parseEntryRef(raw.entry)
      return entry ? { type: 'highlight', entry } : null
    }
    default:
      return null
  }
}

/** Reads an event emitted by the theme, or null when it is malformed. */
export function parseInspectEvent(raw: unknown): InspectEvent | null {
  if (!isRecord(raw))
    return null
  if (raw.type === 'deck')
    return typeof raw.entry === 'string' && raw.entry !== '' ? { type: 'deck', entry: raw.entry } : null
  if (raw.type !== 'drag')
    return null
  const key = parseInspectKey(raw.key)
  const from = parseRect(raw.from)
  const to = parseRect(raw.to)
  if (!key || !from || !to)
    return null
  if (typeof raw.slideNo !== 'number' || !Number.isInteger(raw.slideNo) || raw.slideNo < 1)
    return null
  return { type: 'drag', slideNo: raw.slideNo, key, from, to }
}

/** The Vite HMR event names the command and event streams travel under. */
export const INSPECT_COMMAND_EVENT = 'codeurjc-slidev:inspect-command'
export const INSPECT_CLIENT_EVENT = 'codeurjc-slidev:inspect-event'
/** Sent by a freshly loaded page, asking the server to replay the controller's current state. */
export const INSPECT_SYNC_EVENT = 'codeurjc-slidev:inspect-sync'

/** The dev-server paths the controller talks to. */
export const INSPECT_COMMAND_PATH = '/api/geometry-inspect'
export const INSPECT_STREAM_PATH = '/api/geometry-inspect/events'
