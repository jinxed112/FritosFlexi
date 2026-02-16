import { createClient } from '@/lib/supabase/server';
import FlexiNav from '@/components/flexi/FlexiNav';
import FlexiHeader from '@/components/flexi/FlexiHeader';
import Link from 'next/link';

export default async function FlexiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Not authenticated (login page) — render without portal chrome
  if (!user) {
    return <>{children}</>;
  }

  const { data: worker } = await supabase
    .from('flexi_workers')
    .select('*')
    .eq('user_id', user.id)
    .single();

  // No worker profile yet — render without portal chrome
  if (!worker) {
    return <>{children}</>;
  }

  const needsContract = !worker.framework_contract_date;

  return (
    <div className="max-w-md mx-auto bg-gray-50 min-h-screen flex flex-col">
      <FlexiHeader worker={worker as any} />

      {/* Contract banner */}
      {needsContract && (
        <Link href="/flexi/contract"
          className="mx-4 mt-3 block bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 hover:bg-amber-100 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-lg">✍️</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-800">Contrat-cadre à signer</p>
              <p className="text-xs text-amber-600">Signez votre contrat pour pouvoir recevoir des missions</p>
            </div>
            <span className="text-amber-400 text-lg">›</span>
          </div>
        </Link>
      )}

      <main className="flex-1 overflow-auto px-4 py-4">
        {children}
      </main>
      <FlexiNav />
    </div>
  );
}