// The extension's end of the controller channel: an event stream from the dev
// server, and commands posted to it. Deliberately thin -- deciding what to do
// with events lives in liveLink.ts / applyDrag.ts, which are unit tested.
//
// No webview here: the preview is whatever the author already has open (the
// official Slidev extension's, or a browser tab). The theme listens on the dev
// server's HMR socket, so commands reach every open preview alike.

import type { InspectCommand, InspectEvent } from 'codeurjc-slidev-theme/composables/useInspectProtocol'
import { INSPECT_COMMAND_PATH, INSPECT_STREAM_PATH, parseInspectEvent } from 'codeurjc-slidev-theme/composables/useInspectProtocol'
import { readEventStream } from './liveLink'

export class DevServerLink {
  private abort: AbortController | null = null

  constructor(
    readonly baseUrl: string,
    private readonly onEvent: (event: InspectEvent) => void,
    private readonly onClose: () => void,
  ) {}

  /** Opens the event stream. False when no dev server answers at `baseUrl`. */
  async attach(): Promise<boolean> {
    this.abort = new AbortController()
    let res: Response
    try {
      res = await fetch(new URL(INSPECT_STREAM_PATH, this.baseUrl), { signal: this.abort.signal })
    }
    catch {
      return false
    }
    if (!res.ok || !res.body)
      return false
    void this.read(res.body)
    return true
  }

  private async read(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      for (;;) {
        const { value, done } = await reader.read()
        if (done)
          break
        const { events, rest } = readEventStream(buffer + decoder.decode(value, { stream: true }))
        buffer = rest
        for (const raw of events) {
          const event = parseInspectEvent(raw)
          if (event)
            this.onEvent(event)
        }
      }
    }
    catch {
      // aborted, or the server went away
    }
    this.onClose()
  }

  async send(command: InspectCommand): Promise<boolean> {
    try {
      const res = await fetch(new URL(INSPECT_COMMAND_PATH, this.baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
      })
      return res.ok
    }
    catch {
      return false
    }
  }

  dispose(): void {
    this.abort?.abort()
    this.abort = null
  }
}
