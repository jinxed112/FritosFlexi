import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

interface Props {
  params: { token: string };
}

export default async function PointagePage({ params }: Props) {
  const supabase = createClient();

  // Validate token and find location
  const { data: location } = await supabase
    .from('locations')
    .select('id, name')
    .eq('qr_code_token', params.token)
    .eq('is_active', true)
    .single();

  if (!location) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <div className="text-4xl mb-3">❌</div>
          <h1 className="text-lg font-bold text-gray-900">QR Code invalide</h1>
          <p className="text-sm text-gray-500 mt-1">Ce QR code ne correspond à aucune location active.</p>
        </div>
      </div>
    );
  }

  // Redirect to clock page with location context
  redirect(`/flexi/clock?location=${location.id}`);
}
