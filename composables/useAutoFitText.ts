import { onMounted, onUnmounted, watchEffect, type Ref } from 'vue'

export const AUTOFIT_MIN_PT = 9
export const AUTOFIT_MAX_PT = 26

/**
 * Binary-search the largest font size in [min, max] for which `overflows`
 * returns false. Pure aside from calling the injected `overflows` collaborator,
 * so it's unit-testable without a real DOM.
 */
export function findFitFontSize(
  min: number,
  max: number,
  overflows: (size: number) => boolean,
  maxIterations = 8,
): number {
  if (!overflows(max)) return max
  if (overflows(min)) return min
  let lo = min
  let hi = max
  let best = min
  for (let i = 0; i < maxIterations; i++) {
    const mid = (lo + hi) / 2
    if (overflows(mid)) {
      hi = mid
    } else {
      best = mid
      lo = mid
    }
  }
  return best
}

/**
 * Keeps `inner`'s rendered height within `boxHeight()` by adjusting a
 * `--content-font-size` custom property on `outer` (inherited down to
 * `inner` and its content). `outer`'s own geometry is never touched — only
 * the font size. Recomputes on mount, whenever `boxHeight()`'s reactive
 * dependencies change, and whenever `inner`'s subtree mutates (e.g. Slidev's
 * v-click toggling child visibility).
 */
export function useAutoFitText(
  outer: Ref<HTMLElement | null>,
  inner: Ref<HTMLElement | null>,
  boxHeight: () => number,
) {
  let rafId: number | null = null
  let observer: MutationObserver | null = null

  function overflowsAt(size: number): boolean {
    const o = outer.value
    const i = inner.value
    if (!o || !i) return false
    o.style.setProperty('--content-font-size', `${size}pt`)
    // offsetHeight (not getBoundingClientRect) -- Slidev renders each slide
    // at a fixed logical resolution and scales the whole thing via a CSS
    // transform for responsive display. getBoundingClientRect returns the
    // post-transform (viewport) size, while boxHeight() is a pre-transform
    // logical value from the layout editor -- comparing the two directly
    // scales the effective shrink threshold by whatever the current
    // transform happens to be. offsetHeight is unaffected by transforms and
    // stays in the same logical coordinate space as boxHeight().
    return i.offsetHeight > boxHeight()
  }

  function fit() {
    if (!outer.value || !inner.value) return
    const size = findFitFontSize(AUTOFIT_MIN_PT, AUTOFIT_MAX_PT, overflowsAt)
    outer.value.style.setProperty('--content-font-size', `${size}pt`)
  }

  function scheduleFit() {
    if (rafId !== null) return
    rafId = requestAnimationFrame(() => {
      rafId = null
      fit()
    })
  }

  onMounted(() => {
    if (inner.value && typeof MutationObserver !== 'undefined') {
      observer = new MutationObserver(scheduleFit)
      observer.observe(inner.value, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class'],
        characterData: true,
      })
    }

    // The theme's web font (e.g. Nunito Sans) loads asynchronously; the
    // initial fit can run against the fallback font's metrics, which may be
    // wider/taller and trigger an unnecessary shrink. Re-fit once the real
    // font is active so the size reflects final metrics, not the fallback's.
    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.ready.then(() => scheduleFit())
    }
  })

  // Reruns whenever a reactive dependency read inside boxHeight() (e.g. the
  // layout editor's live-dragged content box height) changes. flush: 'post'
  // so refs are populated (DOM mounted) by the time this first runs.
  watchEffect(() => {
    boxHeight()
    scheduleFit()
  }, { flush: 'post' })

  onUnmounted(() => {
    observer?.disconnect()
    if (rafId !== null) cancelAnimationFrame(rafId)
  })

  return { fit }
}
