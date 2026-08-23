/** Machine value of the preset that requires an explicit GUI risk gate. */
export const FULL_ACCESS_PRESET = 'danger-full-access'

/**
 * Convert conventional kebab-case preset names into user-facing title case.
 * @param name - host-supplied preset label or key.
 * @returns the title-cased conventional key, or a non-kebab label unchanged.
 */
export function displayPresetName(name: string): string {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return name
  return name.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

/**
 * Render a permission preset under its English product label.
 * Locale-aware surfaces call {@link localizedPresetLabel} instead.
 * @param value - preset machine value.
 * @param name - host-supplied preset name.
 * @returns the Full access product label or the conventional display name.
 */
export function displayPermissionPreset(value: string, name: string): string {
  return value === FULL_ACCESS_PRESET ? 'Full access' : displayPresetName(name)
}

const PRESET_LABEL_KEYS = {
  'read-only': 'preset.read-only',
  'workspace-write': 'preset.workspace-write',
  [FULL_ACCESS_PRESET]: 'preset.full-access',
} as const

/**
 * Render a permission preset under the active locale's product label.
 * Unknown host-configured names keep {@link displayPermissionPreset}.
 * @param value - preset machine value.
 * @param name - host-supplied preset name.
 * @param t - translator for the surface's preset keys.
 * @returns the localized product label.
 */
export function localizedPresetLabel(
  value: string,
  name: string,
  t: (key: string) => string,
): string {
  const key = PRESET_LABEL_KEYS[value as keyof typeof PRESET_LABEL_KEYS]
  return key === undefined ? displayPermissionPreset(value, name) : t(key)
}
