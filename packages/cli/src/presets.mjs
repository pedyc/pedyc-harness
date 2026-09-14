import genericPreset from '@pedyc/harness-preset-generic'
import vuePreset from '@pedyc/harness-preset-vue'

const presets = new Map([
  [genericPreset.name, genericPreset],
  [vuePreset.name, vuePreset],
])

export const availablePresets = () => [...presets.keys()]

export const getPreset = (name) => presets.get(name)
