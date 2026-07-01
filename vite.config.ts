import { resolve } from 'path'
import { readFileSync, existsSync } from 'fs'

const VAR_MAP: Record<string, Record<string, string>> = {
  'red-bar': { h: '--ed-red-h' },
  logo: { y: '--ed-logo-y', x: '--ed-logo-rx' },
  title: { y: '--ed-title-y', x: '--ed-title-x', w: '--ed-title-w', h: '--ed-title-h' },
  content: { y: '--ed-content-y', x: '--ed-content-x', w: '--ed-content-w', h: '--ed-content-h' },
}

const customSideEditorPath = resolve(import.meta.dirname, '_override/SideEditor.vue')
const useEditorAbsPath = `/@fs${resolve(import.meta.dirname, 'composables/useEditor.ts')}`

export default {
  plugins: [
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

          if (styleParts.length > 0) {
            const newStyle = styleParts.join('; ')
            // Replace data-styles (used by onMounted to restore positions)
            content = content.replace(/data-styles="[^"]*"/, `data-styles="${newStyle}"`)
            // Replace the existing style="..." attribute on the root div with updated values
            content = content.replace(/style="[^"]*"/, `style="${newStyle}"`)
          }

          // Persist hidden state as data-hidden attribute on root div
          const hiddenNames = Object.entries(hidden)
            .filter(([_, v]) => v)
            .map(([k]) => k)
          content = content.replace(/\s*data-hidden="[^"]*"/, '')
          if (hiddenNames.length > 0) {
            content = content.replace(
              /(class="slidev-layout default[^"]*"\s*)/,
              `$1data-hidden="${hiddenNames.join(',')}" `
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

          // Invalidate the layout module so Vite re-reads it from disk
          if (writtenPath && server) {
            const realPath = realpathSync(resolvePath(writtenPath))
            const mods = server.moduleGraph.getModulesByFile(realPath)
            if (mods) {
              for (const mod of mods) {
                server.moduleGraph.invalidateModule(mod)
              }
            }
            server.watcher.emit('change', resolvePath(realPath))
          }

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ layoutName }))
        })
      },
    },
  ],
}
