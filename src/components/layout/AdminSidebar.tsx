"use client";

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  FileText,
  Receipt,
  Mail,
  UserCog,
  ChevronLeft,
  ChevronRight,
  Building2
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  {
    title: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard
  },
  {
    title: 'Clients',
    href: '/clients',
    icon: Building2
  },
  {
    title: 'Contracts',
    href: '/contracts',
    icon: FileText
  },
  {
    title: 'Invoices',
    href: '/invoices',
    icon: Receipt
  },
  {
    title: 'Letters',
    href: '/letters',
    icon: Mail
  },
  {
    title: 'Users',
    href: '/users',
    icon: UserCog
  }
];

export function AdminSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        'h-screen bg-sidebar text-sidebar-foreground flex flex-col transition-all duration-300 sticky top-0',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo Section */}
      <div className="p-4 border-b border-sidebar-border flex items-center gap-3">
        <img
          src="/logo.jpg"
          alt="IECNET Logo"
          className={cn(
            'rounded-md transition-all',
            collapsed ? 'w-8 h-8' : 'w-10 h-10'
          )}
        />
        {!collapsed && (
          <div className="flex flex-col">
            <span className="font-semibold text-sm">IECNET</span>
            <span className="text-xs opacity-80">Admin System</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href));
            
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors',
                    'hover:bg-sidebar-accent',
                    isActive && 'bg-sidebar-accent font-medium'
                  )}
                  title={collapsed ? item.title : undefined}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {!collapsed && <span>{item.title}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="p-4 border-t border-sidebar-border flex items-center justify-center hover:bg-sidebar-accent transition-colors"
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? (
          <ChevronRight className="w-5 h-5" />
        ) : (
          <ChevronLeft className="w-5 h-5" />
        )}
      </button>
    </aside>
  );
}
