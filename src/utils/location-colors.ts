export type LocationLike = { name?: string | null } | null | undefined;

const LOCATION_COLOR_MAP: Record<string, { borderClass: string; hex: string; legendLabel: string }> = {
  'MDjambo Boussu':     { borderClass: 'border-l-blue-500',   hex: '#3b82f6', legendLabel: 'Boussu' },
  'MDjambo Jurbise':    { borderClass: 'border-l-violet-500', hex: '#8b5cf6', legendLabel: 'Jurbise' },
  'MDjambo Événements': { borderClass: 'border-l-amber-500',  hex: '#f59e0b', legendLabel: 'Événements' },
};

const FALLBACK = { borderClass: 'border-l-gray-400', hex: '#9ca3af', legendLabel: 'Autre' };

export function getLocationBorderClass(location: LocationLike): string {
  if (!location?.name) return FALLBACK.borderClass;
  return LOCATION_COLOR_MAP[location.name]?.borderClass ?? FALLBACK.borderClass;
}

export function getLocationColorHex(location: LocationLike): string {
  if (!location?.name) return FALLBACK.hex;
  return LOCATION_COLOR_MAP[location.name]?.hex ?? FALLBACK.hex;
}

export function getKnownLocationLegend(): Array<{ name: string; hex: string; label: string }> {
  return Object.entries(LOCATION_COLOR_MAP).map(([name, v]) => ({
    name,
    hex: v.hex,
    label: v.legendLabel,
  }));
}
