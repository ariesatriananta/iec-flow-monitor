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
import { useRouteLoading } from '@/contexts/RouteLoadingContext';

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

interface AdminSidebarProps {
  variant?: 'default' | 'sheet';
  onNavigate?: () => void;
}

export function AdminSidebar({ variant = 'default', onNavigate }: AdminSidebarProps) {
  const allowCollapse = variant === 'default';
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { loadingHref, setRouteLoading } = useRouteLoading();

  const isCollapsed = allowCollapse ? collapsed : false;

  return (
    <aside
      className={cn(
        'bg-sidebar text-sidebar-foreground flex flex-col transition-all duration-300',
        variant === 'default' ? 'h-screen sticky top-0' : 'h-full',
        isCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo Section */}
      <div
        className={cn(
          'p-4 border-b border-sidebar-border flex gap-3',
          isCollapsed ? 'flex-col items-center' : 'items-center justify-between'
        )}
      >
        <div className={cn('flex items-center gap-3 min-w-0', isCollapsed && 'justify-center')}>
          <img
            src="/logo-2.jpg"
            alt="IECNET Logo"
            className={cn(
              'rounded-md transition-all',
              isCollapsed ? 'w-8 h-8' : 'w-16 h-10'
            )}
          />
          {!isCollapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-sm">IECNET</span>
              <span className="text-xs opacity-80">Admin System</span>
            </div>
          )}
        </div>
        {allowCollapse && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              'p-2 rounded-md hover:bg-sidebar-accent transition-colors',
              isCollapsed && 'mt-1'
            )}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-1 px-2">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href));
            const isLoading = loadingHref === item.href;
            
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors',
                    'hover:bg-sidebar-accent',
                    isActive && 'bg-sidebar-accent font-medium'
                  )}
                  onClick={() => {
                    if (!isActive) {
                      setRouteLoading(item.href);
                    }
                    onNavigate?.();
                  }}
                  title={isCollapsed ? item.title : undefined}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  {!isCollapsed && <span className="flex-1">{item.title}</span>}
                  {!isCollapsed && isLoading && (
                    <span className="ml-auto h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border text-xs text-muted-foreground">
        {!isCollapsed ? (
          <div className="flex items-center justify-between">
            <span>© {new Date().getFullYear()} IECNET</span>
            <span>All rights reserved</span>
          </div>
        ) : (
          <span>©</span>
        )}
      </div>
    </aside>
  );
}
