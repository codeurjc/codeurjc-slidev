import type { Zippable } from 'fflate'
import { strToU8, zipSync } from 'fflate'

// Builds small synthetic ODP archives for unit tests, so every conversion rule
// is covered in CI without the (never committed) real course decks. Only the
// ODF parts the importer reads are produced.

const NS_DECL = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
  'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:xlink="http://www.w3.org/1999/xlink"',
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
  'xmlns:presentation="urn:oasis:names:tc:opendocument:xmlns:presentation:1.0"',
  'xmlns:anim="urn:oasis:names:tc:opendocument:xmlns:animation:1.0"',
].join(' ')

/** Text styles every fixture gets: bold, italic, monospace, and a hidden drawing-page style. */
export const BASE_AUTOMATIC_STYLES = [
  '<style:style style:name="Tb" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>',
  '<style:style style:name="Ti" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>',
  '<style:style style:name="Tm" style:family="text"><style:text-properties style:font-name="JetBrains Mono" fo:font-size="14pt"/></style:style>',
  '<style:style style:name="Ta" style:family="text"><style:text-properties style:font-name="Arial" fo:font-size="18pt"/></style:style>',
  '<style:style style:name="Pmono" style:family="paragraph"><style:text-properties style:font-name="JetBrains Mono" fo:font-size="14pt"/></style:style>',
  '<style:style style:name="dpHidden" style:family="drawing-page"><style:drawing-page-properties presentation:visibility="hidden"/></style:style>',
  '<style:style style:name="grBox" style:family="graphic"><style:graphic-properties draw:stroke="solid" draw:fill="none" fo:padding-top="0.125cm"/></style:style>',
  '<style:style style:name="grPlain" style:family="graphic"><style:graphic-properties draw:stroke="none" draw:fill="none"/></style:style>',
].join('')

const FONT_FACES = [
  '<style:font-face style:name="JetBrains Mono" svg:font-family="\'JetBrains Mono\'"/>',
  '<style:font-face style:name="Arial" svg:font-family="Arial"/>',
].join('')

export const DEFAULT_MASTER = [
  '<style:master-page style:name="codeurjc" style:page-layout-name="PM1">',
  frame('title', { x: 0.725, y: -0.09, w: 21.409, h: 2.903 }, '<draw:text-box/>'),
  frame('outline', { x: 1.27, y: 4.457, w: 22.859, h: 11.048 }, '<draw:text-box/>'),
  '</style:master-page>',
].join('')

export interface FixtureOptions {
  pages: string[]
  automaticStyles?: string
  masterStyles?: string
  pageWidthCm?: number
  pageHeightCm?: number
  files?: Record<string, Uint8Array | string>
}

export function buildOdp(options: FixtureOptions): Uint8Array {
  const width = options.pageWidthCm ?? 25.4
  const height = options.pageHeightCm ?? 19.05
  const content = `<?xml version="1.0" encoding="UTF-8"?><office:document-content ${NS_DECL} office:version="1.3"><office:font-face-decls>${FONT_FACES}</office:font-face-decls><office:automatic-styles>${BASE_AUTOMATIC_STYLES}${options.automaticStyles ?? ''}</office:automatic-styles><office:body><office:presentation>${options.pages.join('')}</office:presentation></office:body></office:document-content>`
  const styles = `<?xml version="1.0" encoding="UTF-8"?><office:document-styles ${NS_DECL} office:version="1.3"><office:font-face-decls>${FONT_FACES}</office:font-face-decls><office:styles/><office:automatic-styles><style:page-layout style:name="PM1"><style:page-layout-properties fo:page-width="${width}cm" fo:page-height="${height}cm" style:print-orientation="landscape"/></style:page-layout></office:automatic-styles><office:master-styles>${options.masterStyles ?? DEFAULT_MASTER}</office:master-styles></office:document-styles>`
  // A stored first `mimetype` entry and a manifest, so LibreOffice loads the fixture too (the comparison-deck export test).
  const manifest = `<?xml version="1.0" encoding="UTF-8"?><manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3"><manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.presentation"/><manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/><manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/></manifest:manifest>`
  const files: Zippable = {
    'mimetype': [strToU8('application/vnd.oasis.opendocument.presentation'), { level: 0 }],
    'content.xml': strToU8(content),
    'styles.xml': strToU8(styles),
    'META-INF/manifest.xml': strToU8(manifest),
  }
  for (const [path, data] of Object.entries(options.files ?? {}))
    files[path] = typeof data === 'string' ? strToU8(data) : data
  return zipSync(files)
}

export interface RectCm { x: number, y: number, w: number, h: number }

function rectAttrs(r: RectCm): string {
  return `svg:x="${r.x}cm" svg:y="${r.y}cm" svg:width="${r.w}cm" svg:height="${r.h}cm"`
}

export function page(inner: string, opts: { name?: string, hidden?: boolean, master?: string } = {}): string {
  const style = opts.hidden ? ' draw:style-name="dpHidden"' : ''
  const name = opts.name ? ` draw:name="${opts.name}"` : ''
  return `<draw:page${name}${style} draw:master-page-name="${opts.master ?? 'codeurjc'}">${inner}</draw:page>`
}

export function frame(presentationClass: string | null, r: RectCm, inner: string, extraAttrs = ''): string {
  const cls = presentationClass ? ` presentation:class="${presentationClass}"` : ''
  return `<draw:frame${cls} ${rectAttrs(r)}${extraAttrs ? ` ${extraAttrs}` : ''}>${inner}</draw:frame>`
}

export function textBox(...paragraphs: string[]): string {
  return `<draw:text-box>${paragraphs.join('')}</draw:text-box>`
}

export function customShape(type: string, r: RectCm, inner = '', styleName = 'grPlain'): string {
  return `<draw:custom-shape draw:style-name="${styleName}" ${rectAttrs(r)}>${inner}<draw:enhanced-geometry draw:type="${type}"/></draw:custom-shape>`
}

export function line(x1: number, y1: number, x2: number, y2: number): string {
  return `<draw:line svg:x1="${x1}cm" svg:y1="${y1}cm" svg:x2="${x2}cm" svg:y2="${y2}cm"/>`
}

/** A `text:p`. `content` is raw inner XML (use `span`/`a`/`br` helpers or plain escaped text). */
export function p(content: string, style?: string): string {
  return `<text:p${style ? ` text:style-name="${style}"` : ''}>${content}</text:p>`
}

export function span(text: string, style: string): string {
  return `<text:span text:style-name="${style}">${text}</text:span>`
}

export function a(text: string, href: string): string {
  return `<text:a xlink:href="${href}">${text}</text:a>`
}

export const br = '<text:line-break/>'
export const tab = '<text:tab/>'

/** A `text:list` whose entries are `item(...)`/`header(...)` strings. */
export function list(...entries: string[]): string {
  return `<text:list>${entries.join('')}</text:list>`
}

export function item(...content: string[]): string {
  return `<text:list-item>${content.join('')}</text:list-item>`
}

export function header(...content: string[]): string {
  return `<text:list-header>${content.join('')}</text:list-header>`
}

export function image(r: RectCm, ...hrefs: string[]): string {
  return frame(null, r, hrefs.map(h => `<draw:image xlink:href="${h}"/>`).join(''))
}

export function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
