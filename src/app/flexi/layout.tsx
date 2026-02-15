import { createClient } from '@/lib/supabase/server';
import FlexiNav from '@/components/flexi/FlexiNav';
import FlexiHeader from '@/components/flexi/FlexiHeader';

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

  return (
    <div className="max-w-md mx-auto bg-gray-50 min-h-screen flex flex-col">
      <FlexiHeader worker={worker as any} />
      <main className="flex-1 overflow-auto px-4 py-4">
        {children}
      </main>
      <FlexiNav />
    </div>
  );
}
