import { defineConfig, presetUno } from 'unocss'

export default defineConfig({
  presets: [presetUno()],
  shortcuts: {
    'urjc-red': 'text-[#cb0017]',
    'urjc-green': 'text-[#8bbb28]',
  },
  theme: {
    colors: {
      urjc: {
        red: '#cb0017',
        green: '#8bbb28',
        dark: '#000000',
        gray: '#4c4c4c',
      },
    },
  },
})
