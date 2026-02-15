import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import DashboardSidebar from '@/components/dashboard/Sidebar';

export default async function DashboardFlexiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.user_metadata?.role !== 'manager') {
    redirect('/flexi/login');
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <DashboardSidebar />
      <main className="flex-1 overflow-auto min-w-0">
        <div className="p-3 pl-14 sm:p-4 sm:pl-14 lg:p-6 lg:pl-6">
          {children}
        </div>
      </main>
    </div>
  );
}
