import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import FlexiNav from '@/components/flexi/FlexiNav';
import FlexiHeader from '@/components/flexi/FlexiHeader';

export default async function FlexiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/flexi/login');

  const { data: worker } = await supabase
    .from('flexi_workers')
    .select('*')
    .eq('user_id', user.id)
    .single();

  if (!worker) redirect('/flexi/login');

  return (
    <div className="max-w-md mx-auto bg-gray-50 min-h-screen flex flex-col">
      <FlexiHeader worker={worker} />
      <main className="flex-1 overflow-auto px-4 py-4">
        {children}
      </main>
      <FlexiNav />
    </div>
  );
}
