// src/app/api/geocode-worker/route.ts
// Appelé depuis le formulaire Mon Compte après sauvegarde du profil.
// Géocode l'adresse et met à jour home_lat / home_lng dans flexi_workers.

import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/transport";

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  // Vérifie que l'utilisateur est authentifié
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { workerId, street, zip, city } = await request.json();

  if (!workerId || !street || !zip || !city) {
    return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
  }

  // Géocodage via Nominatim
  const coords = await geocodeAddress(street, zip, city);

  if (!coords) {
    return NextResponse.json(
      { error: "Adresse introuvable — vérifiez les informations de domicile" },
      { status: 422 }
    );
  }

  // Mise à jour dans Supabase
  const { error } = await supabase
    .from("flexi_workers")
    .update({
      home_lat: coords.lat,
      home_lng: coords.lng,
      home_geocoded_at: new Date().toISOString(),
    })
    .eq("id", workerId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ lat: coords.lat, lng: coords.lng });
}
