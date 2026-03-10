// src/lib/transport.ts
// Calcul des frais de déplacement CP 302 – MDjambo / FritOS Flexi

// ─── Taux kilométrique CP 302 (révisé trimestriellement) ───────────────────
// Source : horecabrussels.be – en vigueur depuis le 01/01/2026
export const KM_RATE_CP302 = 0.4326; // €/km, aller simple uniquement

// ─── Taux horaires minimums légaux CP 302 ──────────────────────────────────
// Flexi-job : taux forfaitaire horeca, pécule vacances 7,67% inclus, brut = net
// En vigueur depuis le 01/03/2026
export const FLEXI_MIN_RATE = 12.78;

// Étudiant : barème sectoriel CP 302 catégorie I/II, 0 années de fonction
// En vigueur depuis le 01/01/2026 (indexation +2,189%) — brut avant solidarité 2,71%
export const STUDENT_MIN_RATE = 15.21;

// ─── Coordonnées GPS des locations ─────────────────────────────────────────
export const LOCATION_COORDS: Record<string, { lat: number; lng: number }> = {
  'MDjambo Jurbise': { lat: 50.526,  lng: 3.908 },
  'MDjambo Boussu':  { lat: 50.4337, lng: 3.7965 },
};

// ─── Haversine ──────────────────────────────────────────────────────────────
/**
 * Distance à vol d'oiseau entre deux points GPS, en kilomètres.
 */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371; // rayon Terre en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Frais de déplacement ───────────────────────────────────────────────────
/**
 * Calcule l'indemnité de déplacement pour un shift.
 * @param homeLat      Latitude du domicile du worker
 * @param homeLng      Longitude du domicile du worker
 * @param locationName Nom de la location ('Jurbise' | 'Boussu')
 * @returns            { distanceKm, allowance } ou null si coords manquantes
 */
export function calcTransportAllowance(
  homeLat: number | null,
  homeLng: number | null,
  locationName: string
): { distanceKm: number; allowance: number } | null {
  if (!homeLat || !homeLng) return null;

  const loc = LOCATION_COORDS[locationName];
  if (!loc) return null;

  const distanceKm = haversineKm(homeLat, homeLng, loc.lat, loc.lng);
  const allowance = Math.round(distanceKm * KM_RATE_CP302 * 100) / 100;

  return { distanceKm: Math.round(distanceKm * 10) / 10, allowance };
}

// ─── Calcul du salaire net d'un shift ──────────────────────────────────────
/**
 * Calcule le salaire estimé pour un shift.
 *
 * Pour les flexi : brut = net (aucune retenue).
 * Pour les étudiants : cotisation de solidarité de 2,71 % déduite.
 */
export function calcShiftEarnings(
  startTime: string, // "HH:mm"
  endTime: string,   // "HH:mm"
  hourlyRate: number,
  workerStatus: string // 'student' | 'pensioner' | 'employee' | 'other'
): {
  hours: number;
  grossSalary: number;
  solidarityDeduction: number;
  netSalary: number;
} {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const hours = Math.round(((eh * 60 + em - (sh * 60 + sm)) / 60) * 100) / 100;

  const grossSalary = Math.round(hours * hourlyRate * 100) / 100;

  // Cotisation de solidarité uniquement pour les étudiants
  const solidarityRate = workerStatus === "student" ? 0.0271 : 0;
  const solidarityDeduction = Math.round(grossSalary * solidarityRate * 100) / 100;
  const netSalary = Math.round((grossSalary - solidarityDeduction) * 100) / 100;

  return { hours, grossSalary, solidarityDeduction, netSalary };
}

// ─── Géocodage Nominatim (OpenStreetMap – sans clé API) ────────────────────
/**
 * Géocode une adresse belge via Nominatim et retourne lat/lng.
 * À appeler côté serveur (API Route / Server Action) pour éviter les CORS.
 */
export async function geocodeAddress(
  street: string,
  zip: string,
  city: string,
  country = "BE"
): Promise<{ lat: number; lng: number } | null> {
  const query = encodeURIComponent(`${street}, ${zip} ${city}, ${country}`);
  const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=${country.toLowerCase()}`;

  try {
    const res = await fetch(url, {
      headers: {
        // Nominatim exige un User-Agent identifiable
        "User-Agent": "FritosFlexiApp/1.0 (mdjambo.be)",
      },
      next: { revalidate: 86400 }, // cache 24h côté Next.js
    });

    if (!res.ok) return null;

    const data = await res.json();
    if (!data || data.length === 0) return null;

    return {
      lat: parseFloat(data[0].lat),
      lng: parseFloat(data[0].lon),
    };
  } catch {
    return null;
  }
}
