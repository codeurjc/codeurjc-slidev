import type { IncomingMessage, ServerResponse } from 'node:http'
import type { InspectCommand } from './composables/useInspectProtocol.ts'
import { Buffer } from 'node:buffer'
import { existsSync, readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import process from 'node:process'
import { defineConfig } from 'vite'
import { markdownImageSrc } from './composables/markdownImageSrc.ts'
import { resolveMarkerLine, serializeMarkerOverride } from './composables/useCodeHighlights.ts'
import { INSPECT_CLIENT_EVENT, INSPECT_COMMAND_EVENT, INSPECT_COMMAND_PATH, INSPECT_STREAM_PATH, INSPECT_SYNC_EVENT, parseInspectCommand, parseInspectEvent } from './composables/useInspectProtocol.ts'

const VAR_MAP: Record<string, Record<string, string>> = {
  'red-bar': { y: '--ed-red-y', x: '--ed-red-x', w: '--ed-red-w', h: '--ed-red-h' },
  'logo': { y: '--ed-logo-y', x: '--ed-logo-rx', w: '--ed-logo-w', h: '--ed-logo-h' },
  'title': { y: '--ed-title-y', x: '--ed-title-x', w: '--ed-title-w', h: '--ed-title-h' },
  'content': { y: '--ed-content-y', x: '--ed-content-x', w: '--ed-content-w', h: '--ed-content-h' },
}

const customSideEditorPath = resolve(import.meta.dirname, '_override/SideEditor.vue')
const useEditorAbsPath = `/@fs${resolve(import.meta.dirname, 'composables/useEditor.ts')}`

/**
 * Resolves the markdown file a dragged callout's slide came from, as reported
 * by the client, to an absolute path inside the consuming project.
 *
 * Returns `undefined` for anything that isn't a markdown file within the
 * project root. The client is the theme's own layout rather than untrusted
 * input, but this middleware writes to disk on an unauthenticated local
 * request, so it stays constrained to the tree the dev server was pointed at.
 */
function resolveSlideSourcePath(root: string, filepath: unknown): string | undefined {
  if (typeof filepath !== 'string' || !filepath)
    return undefined
  const abs = resolve(root, filepath)
  if (!abs.endsWith('.md'))
    return undefined
  const rel = relative(root, abs)
  if (!rel || rel.startsWith('..'))
    return undefined
  return existsSync(abs) ? abs : undefined
}

/** Reads a request body as JSON, or undefined when it isn't parseable. */
async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  try {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(chunk as Buffer)
    return JSON.parse(Buffer.concat(chunks).toString())
  }
  catch {
    return undefined
  }
}

const IMAGE_MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

// `public/` (pasted-image assets) is consumer content, resolved against the
// consuming project's root once this ships as an installable theme -- see
// the `layoutDir`/`slidesPath` comments below for the same rationale.
// Captured via `configResolved` since `resolveId` has no direct access to
// `server.config.root` the way `configureServer` handlers do.
let projectRoot = process.cwd()

export default defineConfig({
  // Slidev merges every root's vite.config and hands the merged `slidev` key to
  // its own plugin, so a theme can extend the slide markdown pipeline here.
  slidev: {
    markdown: {
      markdownSetup(md: Parameters<typeof markdownImageSrc>[0]) {
        markdownImageSrc(md)
      },
    },
  },
  plugins: [
    {
      // Slidev's markdown-image-to-import transform rejects absolute
      // "/images/..." specifiers via its slidev:slide-import-guard (it
      // resolves them as literal filesystem-root paths rather than through
      // publicDir, even for long-existing public files). Rewriting the
      // specifier to the real public/images path lets pasted-image markdown
      // references resolve correctly. Scoped to slide-markdown importers
      // only (Slidev's virtual `__slidev_<n>.md` ids) -- a global
      // resolve.alias would also catch plain `<img src="/images/...">` in
      // layout .vue files, whose default resolution already works and
      // shouldn't be rerouted through a filesystem import (doing so made
      // Vite serve them at /public/images/... and warn about it).
      name: 'slidev-slide-image-resolver',
      enforce: 'pre',
      configResolved(config) {
        projectRoot = config.root
      },
      resolveId(id, importer) {
        if (!id.startsWith('/images/'))
          return null
        if (!importer || !/__slidev_\d+\.(?:md|frontmatter)/.test(importer))
          return null
        return resolve(projectRoot, `public${id}`)
      },
    },
    {
      name: 'slidev-side-editor-override',
      enforce: 'pre',
      transform(code, id) {
        if (!id.includes('SideEditor.vue') || id.includes('?vue'))
          return null
        let content = readFileSync(customSideEditorPath, 'utf-8')
        content = content.replace('__USE_EDITOR_PATH__', useEditorAbsPath)
        return content
      },
    },
    {
      name: 'slidev-layout-saver',
      configureServer(server) {
        server.middlewares.use('/api/save-layout', async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end()
            return
          }
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk)
          const body = JSON.parse(Buffer.concat(chunks).toString())
          const { readFileSync, writeFileSync, realpathSync } = await import('node:fs')
          const { resolve: resolvePath } = await import('node:path')
          // `layouts/` is consumer content, not part of this package -- must
          // resolve against the consuming project's root (Vite's resolved
          // `config.root`, i.e. Slidev's `userRoot`), not against wherever
          // this plugin file physically lives (e.g. inside node_modules once
          // this ships as an installable theme).
          const layoutDir = resolvePath(server.config.root, 'layouts')
          const currentLayoutName = (body.currentLayout && String(body.currentLayout).trim()) || 'default'
          const consumerLayoutPath = resolvePath(layoutDir, `${currentLayoutName}.vue`)
          // A consumer project usually has no local copy of a layout it has
          // never edited before (e.g. `default`, shipped by this theme
          // package) -- fall back to the theme's own bundled copy so the
          // very first edit works, then always write the result back into
          // the consumer's own `layouts/` (below), creating a consumer-local
          // override from that point on.
          const packageLayoutPath = resolvePath(import.meta.dirname, 'layouts', `${currentLayoutName}.vue`)
          const layoutPath = existsSync(consumerLayoutPath) ? consumerLayoutPath : packageLayoutPath
          let content = readFileSync(layoutPath, 'utf-8')

          // The package's own layouts import siblings via paths relative to
          // their location inside this package (`../composables/...` for
          // shared code, `../assets/...` for the bundled brand images).
          // When falling back to the package template, those relative
          // imports no longer resolve once the content is written into the
          // consumer's own `layouts/` dir (which has no `composables/` or
          // `assets/` sibling of its own) -- rewrite to the bare package
          // specifier, which Node/Vite resolve through the consumer's
          // `node_modules` regardless of where the file physically lives.
          if (layoutPath === packageLayoutPath) {
            content = content.replace(
              /from '\.\.\/([^']+)'/g,
              `from 'codeurjc-slidev-theme/$1'`,
            )
          }

          // Build inline style attribute value with CSS variable overrides
          // Exclude position variables for hidden elements
          const hidden = body.hidden || {}
          const styleParts: string[] = []
          for (const [name, map] of Object.entries(VAR_MAP)) {
            if (hidden[name])
              continue
            const pos = body.positions[name]
            if (!pos)
              continue
            for (const [prop, cssVar] of Object.entries(map)) {
              const val = pos[prop]
              if (val !== undefined) {
                styleParts.push(`${cssVar}: ${val}px`)
              }
            }
          }
          if (hidden.title) {
            styleParts.push('--ed-title-d: none')
          }
          if (hidden.content) {
            styleParts.push('--ed-content-d: none')
          }

          if (styleParts.length > 0) {
            const newStyle = styleParts.join('; ')
            // Replace data-styles (used by onMounted to restore positions)
            content = content.replace(/data-styles="[^"]*"/, `data-styles="${newStyle}"`)
            // Replace the existing style="..." attribute on the root div with updated values
            content = content.replace(/style="[^"]*"/, `style="${newStyle}"`)
          }

          // Persist hidden state as data-hidden attribute on root div. Only
          // the layout's own elements are recorded: an older client may still
          // send the retired `image` element.
          const hiddenNames = Object.entries(hidden)
            .filter(([name, v]) => v && name in VAR_MAP)
            .map(([k]) => k)
          content = content.replace(/\s*data-hidden="[^"]*"/, '')
          if (hiddenNames.length > 0) {
            content = content.replace(
              /(class="slidev-layout default[^"]*"\s*)/,
              `$1data-hidden="${hiddenNames.join(',')}" `,
            )
          }

          // Persist aspect-lock state as data-aspect-locked, storing only the
          // locked exceptions since every element is unlocked by default
          const aspectLocked = body.aspectLocked || {}
          // Only fixed layout elements -- dynamic editor keys (callouts,
          // per-slide `geometry:*` rects) never belong in a layout file.
          const lockedNames = Object.keys(aspectLocked).filter(name => name in VAR_MAP && aspectLocked[name] === true)
          content = content.replace(/\s*data-aspect-locked="[^"]*"/, '')
          if (lockedNames.length > 0) {
            content = content.replace(
              /(class="slidev-layout default[^"]*"\s*)/,
              `$1data-aspect-locked="${lockedNames.join(',')}" `,
            )
          }

          // Deleted elements are stripped from the template entirely (not just
          // hidden), so they can't be restored after a reload -- only Undo
          // during the same editing session can bring them back.
          for (const name of ['red-bar', 'logo']) {
            if (!hidden[name])
              continue
            const markerRe = new RegExp(`\\n?\\s*<!-- ed:${name}:start -->[\\s\\S]*?<!-- ed:${name}:end -->\\n?`)
            content = content.replace(markerRe, '\n')
          }

          let layoutName = currentLayoutName
          const saveAs = body.saveAs !== false
          let writtenPath: string | null = null
          let isNewFile = false

          const { mkdirSync } = await import('node:fs')
          mkdirSync(layoutDir, { recursive: true })

          if (saveAs) {
            let name: string
            if (body.layoutName && body.layoutName.trim()) {
              name = body.layoutName.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
              if (!name)
                name = `layout-${Date.now()}`
            }
            else {
              name = `layout-${Date.now()}`
            }
            if (existsSync(resolvePath(layoutDir, `${name}.vue`))) {
              name = `${name}-${Date.now()}`
            }
            writtenPath = resolvePath(layoutDir, `${name}.vue`)
            isNewFile = true
            writeFileSync(writtenPath, content, 'utf-8')
            layoutName = name
          }
          else {
            // Overwriting always targets the consumer's own `layouts/`, even
            // when the content was read from the theme's bundled fallback --
            // this is what creates the consumer-local override from the
            // first edit onward.
            writtenPath = consumerLayoutPath
            isNewFile = !existsSync(consumerLayoutPath)
            writeFileSync(consumerLayoutPath, content, 'utf-8')
          }

          // Invalidate the layout module so Vite re-reads it from disk
          if (writtenPath && server) {
            const realPath = realpathSync(resolvePath(writtenPath))
            const mods = server.moduleGraph.getModulesByFile(realPath)
            if (mods) {
              for (const mod of mods) {
                server.moduleGraph.invalidateModule(mod)
              }
            }
            // A brand-new layout file needs an 'add' event, not 'change' --
            // Slidev's layouts virtual module (the list of known layout
            // names) only refreshes in response to its own fs watcher
            // noticing a real add, and a 'change' event on a path it has
            // never seen doesn't trigger that. Without this, a newly written
            // file (via saveAs, or the first edit creating a consumer-local
            // override of a theme-provided layout) can 404 as "Unknown
            // layout" the moment frontmatter references it, since the
            // layouts list is otherwise cached until invalidated.
            server.watcher.emit(isNewFile ? 'add' : 'change', resolvePath(realPath))
          }

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ layoutName }))
        })
      },
    },
    {
      // Persists a dragged code-highlight callout's position back into the
      // `@x,y` suffix of its marker comment. Identified by the marker's
      // exact original source line (round-tripped via the
      // highlight span's data-source-line attribute) rather than by slide
      // index/line number, since callouts are per-highlight-id, not tied to
      // a shared layout file the way the fixed elements are.
      name: 'slidev-code-highlight-position-saver',
      configureServer(server) {
        server.middlewares.use('/api/save-code-highlight-position', async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end()
            return
          }
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk)
          const body = JSON.parse(Buffer.concat(chunks).toString())
          const { sourceLine, filepath, x, y, markerIndex, lineOccurrence, slideStart, slideEnd } = body
          if (typeof sourceLine !== 'string' || typeof x !== 'number' || typeof y !== 'number') {
            res.statusCode = 400
            res.end()
            return
          }
          // The marker lives in whichever markdown file the dragged callout's
          // own slide came from -- the deck entry can be any filename (a
          // course is typically one deck per lecture, `tema1.md`, `tema2.md`,
          // ...), and a single deck can pull further slides in from other
          // files via `src:`. The client therefore reports its slide's own
          // source path (`$route.meta.slide.filepath`) rather than this
          // middleware assuming `slides.md`, which would splice the `@x,y`
          // into an unrelated deck that merely happens to sit at the
          // conventional path.
          const slidesPath = resolveSlideSourcePath(server.config.root, filepath)
          if (!slidesPath) {
            res.statusCode = 400
            res.end()
            return
          }
          const content = readFileSync(slidesPath, 'utf-8')
          const lines = content.split('\n')
          const lineIndex = resolveMarkerLine(lines, sourceLine, { slideStart, slideEnd, lineOccurrence })
          if (lineIndex === -1) {
            res.statusCode = 404
            res.end()
            return
          }
          // A line's comment can carry several markers, so rewrite the one this
          // callout came from rather than the first.
          const newLine = serializeMarkerOverride(lines[lineIndex], x, y, typeof markerIndex === 'number' ? markerIndex : 0)
          lines[lineIndex] = newLine
          const { writeFileSync } = await import('node:fs')
          writeFileSync(slidesPath, lines.join('\n'), 'utf-8')
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ sourceLine: newLine }))
        })
      },
    },
    {
      // The controller channel: carries inspection commands from an external
      // controller (the VS Code extension) to every connected slide client,
      // and drag events back.
      //
      // It has to be a dev-server channel rather than a URL parameter. An
      // embedded preview's iframe URL is built by whoever embeds it -- the
      // official Slidev extension writes `<server>/<n>?embedded=true` itself
      // -- and its message relay only forwards `target: 'slidev'` messages,
      // which Slidev's own `useEmbeddedCtrl` handles and which know nothing
      // about this theme. So commands travel over Vite's HMR socket, which
      // reaches the client whatever its URL says.
      name: 'codeurjc-slidev-geometry-inspect',
      configureServer(server) {
        // Server-sent events, one connection per attached controller. Kept in
        // a set rather than a single slot so a second editor window attaching
        // doesn't silently steal the first one's events.
        const controllers = new Set<ServerResponse>()
        // The controller's current state, replayed to pages that load after
        // it attached (they ask via INSPECT_SYNC_EVENT once their listener is
        // registered, so nothing is lost to a broadcast sent too early).
        let state: { inspect: boolean, control: boolean, highlight: InspectCommand & { type: 'highlight' } | null } = { inspect: false, control: false, highlight: null }
        const broadcast = (command: InspectCommand) => server.hot.send({ type: 'custom', event: INSPECT_COMMAND_EVENT, data: command })

        server.middlewares.use(INSPECT_STREAM_PATH, (req, res) => {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          })
          // Headers only leave on the first body write: without this, a
          // controller's request wouldn't complete until some page happened
          // to send an event, and with no preview open it never would. An SSE
          // comment line is ignored by readers.
          res.write(': attached\n\n')
          controllers.add(res)
          // Which deck is being served is answered by the client, not from
          // here: Vite's resolved config carries the theme-facing `slidev`
          // plugin options, not Slidev's resolved entry. The client knows its
          // own slide's source file, which is what this codebase already
          // relies on for the callout position write-back. Asking for it on
          // attach makes every connected client announce itself.
          broadcast({ type: 'whichDeck' })
          req.on('close', () => {
            controllers.delete(res)
            // A controller that goes away while holding geometry writes would
            // otherwise leave every page emitting drags into the void, never
            // writing them. The last one leaving hands everything back.
            if (controllers.size === 0) {
              if (state.control)
                broadcast({ type: 'control', on: false })
              if (state.inspect)
                broadcast({ type: 'inspect', on: false })
              state = { inspect: false, control: false, highlight: null }
            }
          })
        })

        server.middlewares.use(INSPECT_COMMAND_PATH, async (req, res, next) => {
          // `use(path)` matches by prefix: leave the event stream (and
          // anything else under this path) to its own handler.
          if (req.url && req.url !== '/' && !req.url.startsWith('/?')) {
            next()
            return
          }
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end()
            return
          }
          const command = parseInspectCommand(await readJsonBody(req))
          if (!command) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'unrecognized command' }))
            return
          }
          if (command.type === 'inspect')
            state = { ...state, inspect: command.on, highlight: command.on ? state.highlight : null }
          else if (command.type === 'control')
            state = { ...state, control: command.on }
          else if (command.type === 'highlight')
            state = { ...state, highlight: command }
          broadcast(command)
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
        })

        server.hot.on(INSPECT_SYNC_EVENT, () => {
          if (controllers.size === 0)
            return
          broadcast({ type: 'inspect', on: state.inspect })
          broadcast({ type: 'control', on: state.control })
          if (state.highlight)
            broadcast(state.highlight)
          broadcast({ type: 'whichDeck' })
        })

        // Drags travel client → server over the same HMR socket, then out to
        // every attached controller.
        server.hot.on(INSPECT_CLIENT_EVENT, (data: unknown) => {
          const event = parseInspectEvent(data)
          if (!event)
            return
          const payload = `data: ${JSON.stringify(event)}\n\n`
          for (const res of controllers) res.write(payload)
        })

        server.httpServer?.on('close', () => {
          for (const res of controllers) res.end()
          controllers.clear()
        })
      },
    },
    {
      name: 'slidev-image-saver',
      configureServer(server) {
        server.middlewares.use('/api/save-image', async (req, res) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end()
            return
          }
          const mime = (req.headers['content-type'] || '').split(';')[0].trim()
          const ext = IMAGE_MIME_EXT[mime]
          if (!ext) {
            res.statusCode = 400
            res.end()
            return
          }
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk)
          const buffer = Buffer.concat(chunks)
          const { writeFileSync, mkdirSync, existsSync } = await import('node:fs')
          const { resolve: resolvePath } = await import('node:path')
          // Consumer content, resolved against the consuming project's root
          // -- same rationale as `layoutDir`/`slidesPath` above.
          const imagesDir = resolvePath(server.config.root, 'public/images')
          if (!existsSync(imagesDir))
            mkdirSync(imagesDir, { recursive: true })
          const filename = `paste-${Date.now()}.${ext}`
          const writtenPath = resolvePath(imagesDir, filename)
          writeFileSync(writtenPath, buffer)

          // Vite caches its known "public files" set at startup and only
          // updates it reactively from its own fs watcher's add/unlink
          // events. Without this, the slide's next re-render can race ahead
          // of that watcher and reject the fresh image via
          // slidev:slide-import-guard. Emitting synchronously (mirroring how
          // /api/save-layout notifies the watcher of layout changes) avoids
          // depending on real filesystem-event timing.
          server.watcher.emit('add', writtenPath)

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ filename, path: `/images/${filename}` }))
        })
      },
    },
    {
      // Slidev's own `handleHotUpdate` only re-transforms/pushes an update
      // for a slide's virtual `__slidev_<n>.md`/`.frontmatter` module when
      // it finds that module already registered as an *importer* with a
      // live HMR-connected client to push to (it pushes updates via
      // `ctx.server.reloadModule`/the returned module list, but never calls
      // `moduleGraph.invalidateModule` directly for a slide with no current
      // subscriber). A slide number that was visited earlier in the dev
      // server's lifetime, then not re-visited by any open page across a
      // later edit, can keep serving a stale cached transform to the next
      // *brand-new* page that requests it -- observed empirically running
      // a deck through many edits in one long-lived server (e.g. several
      // Playwright suites swapping a shared fixture file in sequence).
      // Force-invalidating every slide virtual module on every markdown
      // edit is a blunt but reliable fix: decks here are small, so
      // re-transforming all of them is cheap, and it removes an entire
      // class of "stale content on a route no one currently has open"
      // staleness that no amount of client-side reload/retry can work
      // around (the cache lives server-side, keyed by module id).
      name: 'slidev-force-invalidate-slide-modules',
      handleHotUpdate({ file, server }) {
        // Any markdown file, not just `slides.md`: the deck entry can be
        // named anything, and `src:`-included files are slide sources too.
        if (!file.endsWith('.md'))
          return
        for (const mod of server.moduleGraph.idToModuleMap.values()) {
          if (mod.id && /__slidev_\d+\.(?:md|frontmatter)$/.test(mod.id)) {
            server.moduleGraph.invalidateModule(mod)
          }
        }
      },
    },
  ],
})
