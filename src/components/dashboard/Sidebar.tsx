'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, Calendar, Users, Radio,
  CheckSquare, FileText, Download, ChevronLeft, Menu, X, LogOut,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

const navItems = [
  { href: '/dashboard/flexis', label: 'Vue d\'ensemble', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/flexis/planning', label: 'Planning', icon: Calendar },
  { href: '/dashboard/flexis/workers', label: 'Workers', icon: Users },
  { href: '/dashboard/flexis/live', label: 'Live', icon: Radio },
  { href: '/dashboard/flexis/validation', label: 'Validation', icon: CheckSquare },
  { href: '/dashboard/flexis/dimona', label: 'Dimona', icon: FileText },
  { href: '/dashboard/flexis/export', label: 'Export Partena', icon: Download },
];

export default function DashboardSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/flexi/login');
  };

  // Close mobile menu on nav
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const NavContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <>
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white font-black text-xs flex-shrink-0">
            F
          </div>
          {(!collapsed || isMobile) && (
            <span className="font-bold text-sm tracking-tight">
              FritOS <span className="text-orange-400">Flexi</span>
            </span>
          )}
        </div>
        {isMobile && (
          <button onClick={() => setMobileOpen(false)} className="text-gray-400 hover:text-white p-1">
            <X size={20} />
          </button>
        )}
      </div>

      <nav className="flex-1 px-2 py-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive ? 'bg-orange-500/20 text-orange-400' : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}>
              <Icon size={18} className="flex-shrink-0" />
              {(!collapsed || isMobile) && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="px-2 pb-2 mt-auto">
        <button onClick={handleLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors">
          <LogOut size={18} className="flex-shrink-0" />
          {(!collapsed || isMobile) && <span>Déconnexion</span>}
        </button>
      </div>

      {!isMobile && (
        <button onClick={() => setCollapsed(!collapsed)}
          className="p-3 text-gray-500 hover:text-white transition-colors">
          {collapsed ? <Menu size={18} /> : <ChevronLeft size={18} />}
        </button>
      )}
    </>
  );

  return (
    <>
      {/* Mobile hamburger button — fixed top-left */}
      <button onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-40 w-10 h-10 bg-gray-900 text-white rounded-xl flex items-center justify-center shadow-lg">
        <Menu size={20} />
      </button>

      {/* Mobile overlay sidebar */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-64 bg-gray-900 text-white flex flex-col h-full shadow-2xl">
            <NavContent isMobile />
          </div>
          <div className="flex-1 bg-black/40" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      {/* Desktop sidebar */}
      <div className={`hidden lg:flex ${collapsed ? 'w-16' : 'w-52'} bg-gray-900 text-white flex-col transition-all duration-200 flex-shrink-0`}>
        <NavContent />
      </div>
    </>
  );
}