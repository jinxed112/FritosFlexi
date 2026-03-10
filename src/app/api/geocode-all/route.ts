// src/app/api/geocode-all/route.ts
// Route admin : géocode en masse tous les workers avec adresse mais sans coordonnées GPS.
// Appelé une seule fois manuellement depuis le dashboard manager.

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { geocodeAddress } from '@/lib/transport';

export async function POST() {
  const supabase = createClient();

  // Vérifier que l'appelant est manager
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.user_metadata?.role !== 'manager') {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  // Récupérer tous les workers avec adresse mais sans coordonnées
  const { data: workers, error } = await supabase
    .from('flexi_workers')
    .select('id, first_name, last_name, address_street, address_zip, address_city')
    .is('home_lat', null)
    .not('address_street', 'is', null)
    .not('address_zip', 'is', null)
    .not('address_city', 'is', null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!workers || workers.length === 0) {
    return NextResponse.json({ message: 'Aucun worker à géocoder', updated: 0 });
  }

  const results: { name: string; status: 'ok' | 'fail'; coords?: { lat: number; lng: number } }[] = [];

  for (const worker of workers) {
    // Nominatim impose un délai entre les requêtes (usage fair-play)
    await new Promise(r => setTimeout(r, 1100));

    const coords = await geocodeAddress(
      worker.address_street!,
      worker.address_zip!,
      worker.address_city!
    );

    if (coords) {
      await supabase
        .from('flexi_workers')
        .update({
          home_lat: coords.lat,
          home_lng: coords.lng,
          home_geocoded_at: new Date().toISOString(),
        })
        .eq('id', worker.id);

      results.push({ name: `${worker.first_name} ${worker.last_name}`, status: 'ok', coords });
    } else {
      results.push({ name: `${worker.first_name} ${worker.last_name}`, status: 'fail' });
    }
  }

  const ok   = results.filter(r => r.status === 'ok').length;
  const fail = results.filter(r => r.status === 'fail').length;

  return NextResponse.json({ updated: ok, failed: fail, details: results });
}
