import { ref } from 'vue'

// Shared "armed" state for the Layout tab's callout tool. The button lives in
// `_override/SideEditor.vue`, but the click that actually places the callout is
// captured by `layouts/default.vue` (it has to run before `.content-overlay`'s
// own drag handler), so both need the same flag. A module-level ref makes it a
// singleton, the way useEditor's own state is shared across mounted slides.
//
// Only one slide can be armed at a time, which is what we want: the tool is
// disarmed as soon as a click places a callout.

const _armed = ref(false)

export function useCalloutTool() {
  return {
    armed: _armed,
    arm: () => {
      _armed.value = true
    },
    disarm: () => {
      _armed.value = false
    },
    toggle: () => {
      _armed.value = !_armed.value
    },
  }
}
