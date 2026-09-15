import type { Element, Node } from '@xmldom/xmldom'
import type { OdpDeck, OdpMaster, OdpShape, OdpSlide, Paragraph, Rect, TextRun } from './model'
import { MONO_FONT_RE, StyleResolver } from './styles'
import { attr, childElements, descendants, firstChild, is, lengthCm, parseXml } from './xml'
import { readOdpArchive } from './zip'

// Reads an ODP archive into the plain `OdpDeck` model: slides with their
// shapes (geometry, paragraphs with list depth, runs with effective
// formatting, images, tables, connector endpoints), master-page placeholder
// regions, and the page size. No classification happens here.

const DEFAULT_PAGE = { pageWidth: 25.4, pageHeight: 19.05 }

export function parseOdp(data: Uint8Array): OdpDeck {
  const archive = readOdpArchive(data)
  const content = parseXml(archive.content)
  const styles = parseXml(archive.styles || '<document-styles/>')
  const resolver = new StyleResolver([content, styles])

  const masters = parseMasters(styles)
  const pages = descendants(content, 'draw', 'page')
  const slides = pages.map((page, i) => parseSlide(page, i + 1, resolver))
  const size = pageSize(resolver, styles, pages[0])
  const pictures = new Map([...archive.files].filter(([path]) => path.startsWith('Pictures/')))
  return { ...size, masters, slides, pictures }
}

function pageSize(resolver: StyleResolver, styles: ReturnType<typeof parseXml>, firstPage: Element | undefined) {
  const readLayout = (layout: Element | undefined) => {
    const props = layout ? firstChild(layout, 'style', 'page-layout-properties') : undefined
    const w = lengthCm(props ? attr(props, 'fo', 'page-width') : undefined)
    const h = lengthCm(props ? attr(props, 'fo', 'page-height') : undefined)
    return w && h ? { pageWidth: w, pageHeight: h } : undefined
  }
  const masterName = firstPage ? attr(firstPage, 'draw', 'master-page-name') : undefined
  const master = descendants(styles, 'style', 'master-page').find(m => attr(m, 'style', 'name') === masterName)
  const fromMaster = readLayout(resolver.get(master ? attr(master, 'style', 'page-layout-name') : undefined))
  if (fromMaster)
    return fromMaster
  for (const layout of descendants(styles, 'style', 'page-layout')) {
    const props = firstChild(layout, 'style', 'page-layout-properties')
    if (props && attr(props, 'style', 'print-orientation') === 'landscape') {
      const size = readLayout(layout)
      if (size)
        return size
    }
  }
  return DEFAULT_PAGE
}

function parseMasters(styles: ReturnType<typeof parseXml>): Map<string, OdpMaster> {
  const masters = new Map<string, OdpMaster>()
  for (const el of descendants(styles, 'style', 'master-page')) {
    const name = attr(el, 'style', 'name')
    if (!name)
      continue
    const master: OdpMaster = { name }
    for (const frame of descendants(el, 'draw', 'frame')) {
      const cls = attr(frame, 'presentation', 'class')
      if (cls === 'outline' && !master.bodyRegion)
        master.bodyRegion = rectOf(frame)
      if (cls === 'title' && !master.titleRegion)
        master.titleRegion = rectOf(frame)
    }
    masters.set(name, master)
  }
  return masters
}

function parseSlide(page: Element, index: number, resolver: StyleResolver): OdpSlide {
  return {
    index,
    name: attr(page, 'draw', 'name') ?? `page${index}`,
    hidden: resolver.isHiddenPage(attr(page, 'draw', 'style-name')),
    masterName: attr(page, 'draw', 'master-page-name') ?? '',
    shapes: childElements(page).flatMap(el => parseShape(el, resolver) ?? []),
  }
}

function rectOf(el: Element): Rect | undefined {
  const x = lengthCm(attr(el, 'svg', 'x'))
  const y = lengthCm(attr(el, 'svg', 'y'))
  const w = lengthCm(attr(el, 'svg', 'width'))
  const h = lengthCm(attr(el, 'svg', 'height'))
  if (x === undefined || y === undefined || w === undefined || h === undefined)
    return undefined
  return { x, y, w, h }
}

const SHAPE_ELEMENTS = new Set(['custom-shape', 'rect', 'ellipse', 'circle', 'polygon', 'polyline', 'path', 'regular-polygon', 'caption', 'measure'])

function parseShape(el: Element, resolver: StyleResolver): OdpShape | null {
  const graphicStyles = [attr(el, 'presentation', 'style-name'), attr(el, 'draw', 'style-name')]
  const textStyles = [attr(el, 'draw', 'text-style-name'), ...graphicStyles]
  const base = (kind: OdpShape['kind']): OdpShape => ({
    kind,
    rect: rectOf(el),
    paragraphs: [],
    images: [],
    ...resolver.graphic(graphicStyles),
  })

  if (is(el, 'draw', 'frame')) {
    const shape = base('shape')
    shape.presentationClass = attr(el, 'presentation', 'class')
    const children = childElements(el)
    const table = children.find(c => is(c, 'table', 'table'))
    const textBox = children.find(c => is(c, 'draw', 'text-box'))
    const object = children.find(c => is(c, 'draw', 'object') || is(c, 'draw', 'object-ole'))
    shape.images = children.filter(c => is(c, 'draw', 'image')).flatMap(c => attr(c, 'xlink', 'href') ?? [])
    if (table) {
      shape.kind = 'table'
      shape.table = descendants(table, 'table', 'table-row').map(row =>
        childElements(row).filter(c => is(c, 'table', 'table-cell')).map(cell => collectParagraphs(cell, textStyles, resolver)))
    }
    else if (textBox) {
      shape.kind = 'text'
      shape.paragraphs = collectParagraphs(textBox, textStyles, resolver)
    }
    else if (object) {
      shape.kind = 'object'
    }
    else if (shape.images.length > 0) {
      shape.kind = 'image'
    }
    return shape
  }

  if (el.namespaceURI && is(el, 'draw', el.localName ?? '') && SHAPE_ELEMENTS.has(el.localName ?? '')) {
    const shape = base('shape')
    const geometry = firstChild(el, 'draw', 'enhanced-geometry')
    shape.geometryType = geometry ? attr(geometry, 'draw', 'type') : el.localName ?? undefined
    shape.paragraphs = collectParagraphs(el, textStyles, resolver)
    return shape
  }

  if (is(el, 'draw', 'line') || is(el, 'draw', 'connector')) {
    const shape = base(is(el, 'draw', 'line') ? 'line' : 'connector')
    const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map(k => lengthCm(attr(el, 'svg', k)))
    if (x1 !== undefined && y1 !== undefined && x2 !== undefined && y2 !== undefined)
      shape.endpoints = { x1, y1, x2, y2 }
    return shape
  }

  if (is(el, 'draw', 'g')) {
    const shape = base('group')
    shape.children = childElements(el).flatMap(c => parseShape(c, resolver) ?? [])
    return shape
  }

  return null
}

function collectParagraphs(
  container: Element,
  shapeStyles: (string | undefined)[],
  resolver: StyleResolver,
  depth = 0,
  isListHeader = false,
  out: Paragraph[] = [],
): Paragraph[] {
  for (const child of childElements(container)) {
    if (is(child, 'text', 'p') || is(child, 'text', 'h')) {
      out.push({ runs: runsOf(child, [attr(child, 'text', 'style-name'), ...shapeStyles], resolver), depth, isListHeader })
    }
    else if (is(child, 'text', 'list')) {
      for (const item of childElements(child)) {
        const header = is(item, 'text', 'list-header')
        if (header || is(item, 'text', 'list-item'))
          collectParagraphs(item, shapeStyles, resolver, depth + 1, header, out)
      }
    }
  }
  return out
}

function runsOf(paragraph: Element, styles: (string | undefined)[], resolver: StyleResolver): TextRun[] {
  const runs: TextRun[] = []
  const push = (text: string, chain: (string | undefined)[], href: string | undefined) => {
    if (!text)
      return
    const style = resolver.runStyle(chain)
    const run: TextRun = {
      text,
      bold: style.bold ?? false,
      italic: style.italic ?? false,
      mono: MONO_FONT_RE.test(style.fontFamily ?? ''),
      ...(href ? { href } : {}),
      ...(style.fontSizePt ? { fontSizePt: style.fontSizePt } : {}),
    }
    const last = runs[runs.length - 1]
    if (last && last.bold === run.bold && last.italic === run.italic && last.mono === run.mono && last.href === run.href && last.fontSizePt === run.fontSizePt)
      last.text += text
    else
      runs.push(run)
  }
  const walk = (node: Element, chain: (string | undefined)[], href: string | undefined) => {
    for (let n: Node | null = node.firstChild; n; n = n.nextSibling) {
      if (n.nodeType === 3) {
        push(n.nodeValue ?? '', chain, href)
        continue
      }
      if (n.nodeType !== 1)
        continue
      const el = n as Element
      if (is(el, 'text', 'span'))
        walk(el, [attr(el, 'text', 'style-name'), ...chain], href)
      else if (is(el, 'text', 'a'))
        walk(el, chain, attr(el, 'xlink', 'href') ?? href)
      else if (is(el, 'text', 's'))
        push(' '.repeat(Number(attr(el, 'text', 'c') ?? '1')), chain, href)
      else if (is(el, 'text', 'tab'))
        push('\t', chain, href)
      else if (is(el, 'text', 'line-break'))
        push('\n', chain, href)
      else if (!is(el, 'text', 'soft-page-break') && !is(el, 'text', 'bookmark') && !is(el, 'text', 'bookmark-start') && !is(el, 'text', 'bookmark-end'))
        walk(el, chain, href)
    }
  }
  walk(paragraph, styles, undefined)
  return runs
}
