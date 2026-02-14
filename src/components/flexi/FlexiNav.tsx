'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Briefcase, Calendar, Clock, User } from 'lucide-react';

const navItems = [
  { href: '/flexi/missions', label: 'Missions', icon: Briefcase },
  { href: '/flexi/planning', label: 'Planning', icon: Calendar },
  { href: '/flexi/clock', label: 'Pointage', icon: Clock },
  { href: '/flexi/account', label: 'Profil', icon: User },
];

export default function FlexiNav() {
  const pathname = usePathname();

  return (
    <nav className="bg-white border-t border-gray-100 px-2 py-2 flex justify-around flex-shrink-0">
      {navItems.map((item) => {
        const isActive = pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center px-3 py-1.5 rounded-xl transition-colors ${
              isActive ? 'text-orange-600' : 'text-gray-400'
            }`}
          >
            <Icon size={20} />
            <span className="text-[10px] font-medium mt-0.5">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
