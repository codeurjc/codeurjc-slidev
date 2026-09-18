import type { InspectEvent } from 'codeurjc-slidev-theme/composables/useInspectProtocol'
import type { AddressInfo } from 'node:net'
import { createServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { DevServerLink } from '../devServer'

// A stand-in for the theme's controller channel (vite.config.ts): an event
// stream and a command endpoint, on a real socket.
function fakeServer() {
  const commands: unknown[] = []
  let stream: import('node:http').ServerResponse | null = null
  const server = createServer((req, res) => {
    if (req.url === '/api/geometry-inspect/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      // As the theme does: headers only leave on the first write.
      res.write(': attached\n\n')
      stream = res
      return
    }
    if (req.url === '/api/geometry-inspect' && req.method === 'POST') {
      let body = ''
      req.on('data', (c) => {
        body += c
      })
      req.on('end', () => {
        commands.push(JSON.parse(body))
        res.end('{"ok":true}')
      })
      return
    }
    res.statusCode = 404
    res.end()
  })
  return {
    commands,
    listen: () => new Promise<string>(r => server.listen(0, '127.0.0.1', () => r(`http://127.0.0.1:${(server.address() as AddressInfo).port}`))),
    write: (text: string) => stream!.write(text),
    endStream: () => stream!.end(),
    connected: () => stream !== null,
    close: () => new Promise<void>((r) => {
      stream?.end()
      server.close(() => r())
    }),
  }
}

let cleanup: (() => Promise<void>) | undefined
afterEach(async () => {
  await cleanup?.()
  cleanup = undefined
})

describe('devServerLink', () => {
  it('reads events split across chunks, and ignores malformed ones', async () => {
    const server = fakeServer()
    const url = await server.listen()
    const events: InspectEvent[] = []
    const link = new DevServerLink(url, e => events.push(e), () => {})
    cleanup = async () => {
      link.dispose()
      await server.close()
    }
    expect(await link.attach()).toBe(true)
    await expect.poll(() => server.connected()).toBe(true)

    server.write('data: {"type":"deck","entry":"/c/tema1.md"}\n\ndata: {"type":"dr')
    server.write('ag","slideNo":2,"key":{"kind":"id","name":"flow"},"from":{"x":1,"y":2,"w":3,"h":4},"to":{"x":5,"y":2,"w":3,"h":4}}\n\n')
    server.write('data: {"type":"drag","slideNo":0}\n\n')

    await expect.poll(() => events.length).toBe(2)
    expect(events[0]).toEqual({ type: 'deck', entry: '/c/tema1.md' })
    expect(events[1]).toMatchObject({ type: 'drag', slideNo: 2, key: { kind: 'id', name: 'flow' } })
  })

  it('posts commands', async () => {
    const server = fakeServer()
    const url = await server.listen()
    const link = new DevServerLink(url, () => {}, () => {})
    cleanup = () => server.close()
    expect(await link.send({ type: 'inspect', on: true })).toBe(true)
    expect(server.commands).toEqual([{ type: 'inspect', on: true }])
  })

  it('reports when the server goes away', async () => {
    const server = fakeServer()
    const url = await server.listen()
    let closed = false
    const link = new DevServerLink(url, () => {}, () => {
      closed = true
    })
    cleanup = () => server.close()
    await link.attach()
    await expect.poll(() => server.connected()).toBe(true)
    server.endStream()
    await expect.poll(() => closed).toBe(true)
  })

  it('fails to attach when nothing answers', async () => {
    const link = new DevServerLink('http://127.0.0.1:1', () => {}, () => {})
    expect(await link.attach()).toBe(false)
    expect(await link.send({ type: 'inspect', on: true })).toBe(false)
  })
})
