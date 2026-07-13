import { resolve } from 'path'
import { readFileSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { serializeMarkerOverride } from './composables/useCodeHighlights'

const __dirname = resolve(import.meta.dirname, '..')

const VAR_MAP: Record<string, Record<string, string>> = {
  'red-bar': { y: '--ed-red-y', x: '--ed-red-x', w: '--ed-red-w', h: '--ed-red-h' },
  logo: { y: '--ed-logo-y', x: '--ed-logo-rx', w: '--ed-logo-w', h: '--ed-logo-h' },
  title: { y: '--ed-title-y', x: '--ed-title-x', w: '--ed-title-w', h: '--ed-title-h' },
  content: { y: '--ed-content-y', x: '--ed-content-x', w: '--ed-content-w', h: '--ed-content-h' },
  image: { y: '--ed-image-y', x: '--ed-image-x', w: '--ed-image-w', h: '--ed-image-h' },
}

const customSideEditorPath = resolve(__dirname, '_override/SideEditor.vue')
const useEditorAbsPath = `/@fs${resolve(__dirname, 'composables/useEditor.ts')}`

const IMAGE_MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export default {
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
      resolveId(id, importer) {
        if (!id.startsWith('/images/')) return null
        if (!importer || !/__slidev_\d+\.(md|frontmatter)/.test(importer)) return null
        return resolve(__dirname, `public${id}`)
      },
    },
    {
      name: 'slidev-side-editor-override',
      enforce: 'pre',
      transform(code, id) {
        if (!id.includes('SideEditor.vue') || id.includes('?vue')) return null
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
          const { readFileSync, writeFileSync, realpathSync } = await import('fs')
          const { resolve: resolvePath } = await import('path')
          const layoutDir = resolvePath(import.meta.dirname, 'layouts')
          const currentLayoutName = (body.currentLayout && String(body.currentLayout).trim()) || 'default'
          const layoutPath = resolvePath(layoutDir, `${currentLayoutName}.vue`)
          let content = readFileSync(layoutPath, 'utf-8')

          // Build inline style attribute value with CSS variable overrides
          // Exclude position variables for hidden elements
          const hidden = body.hidden || {}
          const styleParts: string[] = []
          for (const [name, map] of Object.entries(VAR_MAP)) {
            if (hidden[name]) continue
            const pos = body.positions[name]
            if (!pos) continue
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
          if (hidden.image) {
            styleParts.push('--ed-image-d: none')
          }

          if (styleParts.length > 0) {
            const newStyle = styleParts.join('; ')
            // Replace data-styles (used by onMounted to restore positions)
            content = content.replace(/data-styles="[^"]*"/, `data-styles="${newStyle}"`)
            // Replace the existing style="..." attribute on the root div with updated values
            content = content.replace(/style="[^"]*"/, `style="${newStyle}"`)
          }

          // Persist hidden state as data-hidden attribute on root div.
          // `image` is excluded: unlike the other four elements (which
          // default to shown, so only need recording when explicitly
          // hidden), `image` defaults to hidden -- recording it here would
          // pollute every ordinary save with a spurious "image" entry even
          // when the slide has nothing to do with images. Its shown/hidden
          // state is instead derived at runtime from whether content
          // actually has a trackable image (see layouts/default.vue).
          const hiddenNames = Object.entries(hidden)
            .filter(([name, v]) => v && name !== 'image')
            .map(([k]) => k)
          content = content.replace(/\s*data-hidden="[^"]*"/, '')
          if (hiddenNames.length > 0) {
            content = content.replace(
              /(class="slidev-layout default[^"]*"\s*)/,
              `$1data-hidden="${hiddenNames.join(',')}" `
            )
          }

          // Persist aspect-lock state as data-aspect-locked, storing only the
          // locked exceptions since every element is unlocked by default
          const aspectLocked = body.aspectLocked || {}
          const lockedNames = Object.keys(aspectLocked).filter(name => aspectLocked[name] === true)
          content = content.replace(/\s*data-aspect-locked="[^"]*"/, '')
          if (lockedNames.length > 0) {
            content = content.replace(
              /(class="slidev-layout default[^"]*"\s*)/,
              `$1data-aspect-locked="${lockedNames.join(',')}" `
            )
          }

          // Deleted elements are stripped from the template entirely (not just
          // hidden), so they can't be restored after a reload -- only Undo
          // during the same editing session can bring them back.
          for (const name of ['red-bar', 'logo']) {
            if (!hidden[name]) continue
            const markerRe = new RegExp(`\\n?\\s*<!-- ed:${name}:start -->[\\s\\S]*?<!-- ed:${name}:end -->\\n?`)
            content = content.replace(markerRe, '\n')
          }

          let layoutName = currentLayoutName
          const saveAs = body.saveAs !== false
          let writtenPath: string | null = null

          if (saveAs) {
            let name: string
            if (body.layoutName && body.layoutName.trim()) {
              name = body.layoutName.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
              if (!name) name = `layout-${Date.now()}`
            } else {
              name = `layout-${Date.now()}`
            }
            if (existsSync(resolvePath(layoutDir, `${name}.vue`))) {
              name = `${name}-${Date.now()}`
            }
            writtenPath = resolvePath(layoutDir, `${name}.vue`)
            writeFileSync(writtenPath, content, 'utf-8')
            layoutName = name
          } else {
            writtenPath = layoutPath
            writeFileSync(layoutPath, content, 'utf-8')
          }

          // Notify Vite's file watcher so HMR picks up the change. A
          // brand-new layout file needs an 'add' event, not 'change' --
          // Slidev's layouts virtual module (the list of known layout names)
          // only refreshes in response to its own fs watcher noticing a real
          // add, and a 'change' event on a path it has never seen doesn't
          // trigger that. Without this, saveAs's newly written file can 404
          // as "Unknown layout" the moment frontmatter references it.
          if (writtenPath && server) {
            const { realpathSync } = await import('fs')
            const realPath = realpathSync(resolvePath(writtenPath))
            server.watcher.emit(saveAs ? 'add' : 'change', resolvePath(realPath))
          }

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ layoutName }))
        })
      },
    },
    {
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
          const { sourceLine, x, y } = body
          if (typeof sourceLine !== 'string' || typeof x !== 'number' || typeof y !== 'number') {
            res.statusCode = 400
            res.end()
            return
          }
          const slidesPath = resolve(import.meta.dirname, 'slides.md')
          const content = readFileSync(slidesPath, 'utf-8')
          const idx = content.indexOf(sourceLine)
          if (idx === -1) {
            res.statusCode = 404
            res.end()
            return
          }
          const newLine = serializeMarkerOverride(sourceLine, x, y)
          const newContent = content.slice(0, idx) + newLine + content.slice(idx + sourceLine.length)
          const { writeFileSync } = await import('fs')
          writeFileSync(slidesPath, newContent, 'utf-8')
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ sourceLine: newLine }))
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
          const { writeFileSync, mkdirSync, existsSync } = await import('fs')
          const { resolve: resolvePath } = await import('path')
          const imagesDir = resolvePath(import.meta.dirname, 'public/images')
          if (!existsSync(imagesDir)) mkdirSync(imagesDir, { recursive: true })
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
  ],
}
