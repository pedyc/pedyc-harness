import type { Preset } from '@pedyc/harness-core/contracts'
import genericPreset from '@pedyc/harness-preset-generic'
import vuePreset from '@pedyc/harness-preset-vue'

const presets: Map<string, Preset> = new Map([
  [genericPreset.name, genericPreset],
  [vuePreset.name, vuePreset],
])

export const availablePresets = (): string[] => [...presets.keys()]

export const getPreset = (name: string): Preset | undefined => presets.get(name)
