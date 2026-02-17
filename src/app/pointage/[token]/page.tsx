import { createClient } from '@/lib/supabase/server';
import KioskClock from '@/components/kiosk/KioskClock';

interface Props {
  params: { token: string };
}

export default async function PointagePage({ params }: Props) {
  const supabase = createClient();

  // Find location by QR token
  const { data: location } = await supabase
    .from('locations')
    .select('id, name, qr_code_token')
    .eq('qr_code_token', params.token)
    .eq('is_active', true)
    .single();

  if (!location) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center text-white p-4">
        <div className="text-center">
          <div className="text-5xl mb-4">❌</div>
          <h1 className="text-xl font-bold mb-2">QR Code invalide</h1>
          <p className="text-gray-400 text-sm">Ce QR code ne correspond à aucune location active.</p>
        </div>
      </div>
    );
  }

  return (
    <KioskClock
      locationToken={location.qr_code_token}
      locationName={location.name}
      locationId={location.id}
    />
  );
}
