import type { Document, Element } from '@xmldom/xmldom'
import { attr, childElements, descendants, is, lengthCm } from './xml'

// Resolves effective text/graphic properties by walking ODF style chains
// (`style:parent-style-name`). Style names are looked up in content.xml's
// automatic styles first, then styles.xml's common and automatic styles --
// placeholder frames on slides point at presentation styles whose parents
// (e.g. `codeurjc_5f_-outline1`) live in styles.xml.

export const MONO_FONT_RE = /mono|courier|consol|menlo|fira code|source code|inconsolata|pitch|fixed/i

export interface RunStyle {
  bold?: boolean
  italic?: boolean
  fontFamily?: string
  fontSizePt?: number
}

export class StyleResolver {
  private styles = new Map<string, Element>()
  private fontFaces = new Map<string, string>()

  constructor(docs: Document[]) {
    for (const doc of docs) {
      for (const container of [...descendants(doc, 'office', 'automatic-styles'), ...descendants(doc, 'office', 'styles')]) {
        for (const el of childElements(container)) {
          const name = attr(el, 'style', 'name')
          if (name && !this.styles.has(name))
            this.styles.set(name, el)
        }
      }
      for (const face of descendants(doc, 'style', 'font-face')) {
        const name = attr(face, 'style', 'name')
        const family = attr(face, 'svg', 'font-family')
        if (name && family && !this.fontFaces.has(name))
          this.fontFaces.set(name, family.replace(/^['"]|['"]$/g, ''))
      }
    }
  }

  get(name: string | undefined): Element | undefined {
    return name ? this.styles.get(name) : undefined
  }

  /** First value of a property found walking `name`'s parent chain, in any of the given property groups. */
  private lookup(name: string | undefined, groups: string[], ns: 'fo' | 'style' | 'draw', key: string): string | undefined {
    const seen = new Set<string>()
    let current = name
    while (current && !seen.has(current)) {
      seen.add(current)
      const el = this.styles.get(current)
      if (!el)
        return undefined
      for (const child of childElements(el)) {
        if (child.localName && groups.includes(child.localName)) {
          const v = attr(child, ns, key)
          if (v !== undefined)
            return v
        }
      }
      current = attr(el, 'style', 'parent-style-name')
    }
    return undefined
  }

  /** Text properties for a run, resolved across a list of style names (most specific first). */
  runStyle(styleNames: (string | undefined)[]): RunStyle {
    const groups = ['text-properties']
    const first = <T>(fn: (name: string | undefined) => T | undefined): T | undefined => {
      for (const n of styleNames) {
        const v = fn(n)
        if (v !== undefined)
          return v
      }
      return undefined
    }
    const weight = first(n => this.lookup(n, groups, 'fo', 'font-weight'))
    const fontStyle = first(n => this.lookup(n, groups, 'fo', 'font-style'))
    const fontName = first(n => this.lookup(n, groups, 'style', 'font-name'))
    const foFamily = first(n => this.lookup(n, groups, 'fo', 'font-family'))
    const size = first(n => this.lookup(n, groups, 'fo', 'font-size'))
    const sizeMatch = size ? /^(\d+(?:\.\d+)?)pt$/.exec(size) : null
    return {
      bold: weight === undefined ? undefined : weight === 'bold' || Number(weight) >= 600,
      italic: fontStyle === undefined ? undefined : fontStyle === 'italic' || fontStyle === 'oblique',
      fontFamily: (fontName ? this.fontFaces.get(fontName) ?? fontName : undefined) ?? foFamily?.replace(/^['"]|['"]$/g, ''),
      fontSizePt: sizeMatch ? Number(sizeMatch[1]) : undefined,
    }
  }

  /** Graphic properties of a shape's own style chain. */
  graphic(styleNames: (string | undefined)[]): { hasBorder: boolean, hasFill: boolean, paddingTop: number, paddingBottom: number } {
    const find = (key: string, ns: 'fo' | 'draw') => {
      for (const n of styleNames) {
        const v = this.lookup(n, ['graphic-properties'], ns, key)
        if (v !== undefined)
          return v
      }
      return undefined
    }
    const stroke = find('stroke', 'draw')
    const fill = find('fill', 'draw')
    return {
      hasBorder: stroke !== undefined && stroke !== 'none',
      hasFill: fill !== undefined && fill !== 'none',
      paddingTop: lengthCm(find('padding-top', 'fo')) ?? 0.125,
      paddingBottom: lengthCm(find('padding-bottom', 'fo')) ?? 0.125,
    }
  }

  /** Whether a drawing-page style marks its slide as hidden. */
  isHiddenPage(styleName: string | undefined): boolean {
    const el = this.get(styleName)
    if (!el)
      return false
    return childElements(el).some(c => is(c, 'style', 'drawing-page-properties') && attr(c, 'presentation', 'visibility') === 'hidden')
  }
}
