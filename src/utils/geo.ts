/**
 * Calculate distance between two GPS coordinates using the Haversine formula
 * @returns Distance in meters
 */
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Check if coordinates are within the allowed radius of a location
 */
export function isWithinRadius(
  pointLat: number, pointLng: number,
  locationLat: number, locationLng: number,
  radiusMeters: number
): boolean {
  return haversineDistance(pointLat, pointLng, locationLat, locationLng) <= radiusMeters;
}

/**
 * Request the user's current position via the browser Geolocation API
 */
export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Géolocalisation non supportée par ce navigateur'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
  });
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
