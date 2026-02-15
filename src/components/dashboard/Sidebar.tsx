'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard, Calendar, Users, Radio,
  CheckSquare, FileText, Download, ChevronLeft, Menu,
} from 'lucide-react';

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
  const pathname = usePathname();

  return (
    <div className={`${collapsed ? 'w-16' : 'w-56'} bg-gray-900 text-white flex flex-col transition-all duration-200 flex-shrink-0`}>
      <div className="p-4 flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center text-white font-black text-xs flex-shrink-0">
          F
        </div>
        {!collapsed && (
          <span className="font-bold text-sm tracking-tight">
            FritOS <span className="text-orange-400">Flexi</span>
          </span>
        )}
      </div>

      <nav className="flex-1 px-2 py-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-orange-500/20 text-orange-400'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon size={18} className="flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="p-3 text-gray-500 hover:text-white transition-colors"
      >
        {collapsed ? <Menu size={18} /> : <ChevronLeft size={18} />}
      </button>
    </div>
  );
}
