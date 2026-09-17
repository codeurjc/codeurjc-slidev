import MarkdownIt from 'markdown-it'
import { describe, expect, it } from 'vitest'
import { markdownImageSrc, stampHtmlImages } from '../markdownImageSrc'
import { authoredSrc, formatImageRef, imageRefFor, parseImageRef, resolveImageRef } from '../useImageRefs'

describe('parseImageRef / formatImageRef', () => {
  it('reads srcs, occurrences and positions', () => {
    expect(parseImageRef('/images/a.png')).toEqual({ kind: 'src', src: '/images/a.png' })
    expect(parseImageRef('/images/a.png#2')).toEqual({ kind: 'src', src: '/images/a.png', occurrence: 2 })
    expect(parseImageRef(3)).toEqual({ kind: 'position', index: 3 })
  })

  it('keeps non-numeric fragments in the src', () => {
    expect(parseImageRef('/images/icons.svg#logo')).toEqual({ kind: 'src', src: '/images/icons.svg#logo' })
  })

  it('rejects invalid references', () => {
    for (const raw of ['/images/a.png#0', '/images/a.png#', '', '  ', '#2', -1, 1.5, null, {}])
      expect(parseImageRef(raw), String(raw)).toBeNull()
  })

  it('formats back to frontmatter values', () => {
    expect(formatImageRef({ kind: 'src', src: '/images/a.png' })).toBe('/images/a.png')
    expect(formatImageRef({ kind: 'src', src: '/images/a.png', occurrence: 2 })).toBe('/images/a.png#2')
    expect(formatImageRef({ kind: 'position', index: 1 })).toBe(1)
  })
})

describe('imageRefFor', () => {
  const srcs = ['/images/a.png', '/images/b.png', '/images/a.png', null]

  it('writes the bare src for a unique picture and #N for a repeated one', () => {
    expect(imageRefFor(srcs, 1)).toEqual({ kind: 'src', src: '/images/b.png' })
    expect(imageRefFor(srcs, 0)).toEqual({ kind: 'src', src: '/images/a.png', occurrence: 1 })
    expect(imageRefFor(srcs, 2)).toEqual({ kind: 'src', src: '/images/a.png', occurrence: 2 })
  })

  it('falls back to the position for an image without a src', () => {
    expect(imageRefFor(srcs, 3)).toEqual({ kind: 'position', index: 3 })
  })
})

describe('resolveImageRef', () => {
  const srcs = ['/images/new.png', '/images/a.png', '/images/b.png', '/images/a.png']

  it('finds a src wherever it sits, and occurrences among repeats', () => {
    expect(resolveImageRef({ kind: 'src', src: '/images/b.png' }, srcs)).toEqual({ index: 2 })
    expect(resolveImageRef({ kind: 'src', src: '/images/a.png', occurrence: 2 }, srcs)).toEqual({ index: 3 })
  })

  it('picks the first of a repeated src with a warning suggesting #N', () => {
    const resolved = resolveImageRef({ kind: 'src', src: '/images/a.png' }, srcs)
    expect(resolved.index).toBe(1)
    expect(resolved.warning).toContain('/images/a.png#1')
  })

  it('resolves to nothing, with a warning, rather than another image', () => {
    expect(resolveImageRef({ kind: 'src', src: '/images/old.png' }, srcs)).toEqual({ index: -1, warning: 'no image with src "/images/old.png"' })
    expect(resolveImageRef({ kind: 'src', src: '/images/b.png', occurrence: 2 }, srcs).index).toBe(-1)
    expect(resolveImageRef({ kind: 'position', index: 9 }, srcs).index).toBe(-1)
  })

  it('keeps positions meaning document order', () => {
    expect(resolveImageRef({ kind: 'position', index: 0 }, srcs)).toEqual({ index: 0 })
  })

  it('reads the authored src from data-src, else src', () => {
    const img = (attrs: Record<string, string>) => ({ getAttribute: (name: string) => attrs[name] ?? null })
    expect(authoredSrc(img({ 'src': 'data:image/png;base64,xx', 'data-src': '/images/a.png' }))).toBe('/images/a.png')
    expect(authoredSrc(img({ src: '/images/b.png' }))).toBe('/images/b.png')
  })
})

describe('markdownImageSrc', () => {
  const render = (markdown: string) => {
    const md = new MarkdownIt({ html: true })
    markdownImageSrc(md)
    return md.render(markdown)
  }

  it('copies the written src of markdown images, raw <img> tags and HTML blocks into data-src', () => {
    expect(render('![alt](/images/a.png)')).toContain('<img src="/images/a.png" alt="alt" data-src="/images/a.png">')
    expect(render('text <img src="/images/b.png" class="raw"> more')).toContain('<img src="/images/b.png" class="raw" data-src="/images/b.png">')
    expect(render('<img v-click="1" src="/images/c.png">\n')).toContain('<img v-click="1" src="/images/c.png" data-src="/images/c.png">')
    expect(render('- item ![in list](/images/d.png)')).toContain('data-src="/images/d.png"')
  })

  it('leaves code, dynamic srcs and existing data-src alone', () => {
    expect(render('```md\n![x](/images/zzz.png)\n```')).not.toContain('data-src')
    expect(stampHtmlImages('<img :src="dynamic">')).toBe('<img :src="dynamic">')
    expect(stampHtmlImages('<img src="/a.png" data-src="/b.png">')).toBe('<img src="/a.png" data-src="/b.png">')
    expect(stampHtmlImages('<img src=\'/a "x".png\'/>')).toBe('<img src=\'/a "x".png\' data-src="/a &quot;x&quot;.png"/>')
  })
})
