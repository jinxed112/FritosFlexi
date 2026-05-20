export type LocationLike = { name?: string | null } | null | undefined;

type LocationStyle = {
  borderClass: string;
  bgClass: string;
  hex: string;
  legendLabel: string;
};

const LOCATION_COLOR_MAP: Record<string, LocationStyle> = {
  'MDjambo Boussu':     { borderClass: '!border-l-blue-500',   bgClass: 'bg-blue-100',   hex: '#3b82f6', legendLabel: 'Boussu' },
  'MDjambo Jurbise':    { borderClass: '!border-l-violet-500', bgClass: 'bg-violet-100', hex: '#8b5cf6', legendLabel: 'Jurbise' },
  'MDjambo Événements': { borderClass: '!border-l-amber-500',  bgClass: 'bg-amber-100',  hex: '#f59e0b', legendLabel: 'Événements' },
};

const FALLBACK: LocationStyle = { borderClass: '!border-l-gray-400', bgClass: 'bg-gray-100', hex: '#9ca3af', legendLabel: 'Autre' };

export function getLocationBorderClass(location: LocationLike): string {
  if (!location?.name) return FALLBACK.borderClass;
  return LOCATION_COLOR_MAP[location.name]?.borderClass ?? FALLBACK.borderClass;
}

export function getLocationBgClass(location: LocationLike): string {
  if (!location?.name) return FALLBACK.bgClass;
  return LOCATION_COLOR_MAP[location.name]?.bgClass ?? FALLBACK.bgClass;
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
