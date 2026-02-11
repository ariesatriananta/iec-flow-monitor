"use client";

import { useState, type ComponentType } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  FileText,
  Receipt,
  Mail,
  UserCog,
  Calendar,
  FileCheck,
  Plane,
  Wallet,
  GitBranch,
  Clock3,
  Scale,
  ChevronLeft,
  ChevronRight,
  Building2,
  Pause,
  Play
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouteLoading } from '@/contexts/RouteLoadingContext';
import { useGlobalAudio } from '@/contexts/GlobalAudioContext';
import { useAuth } from '@/contexts/AuthContext';
import type { User } from '@/types';

type NavItem = {
  title: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  roles: User['role'][];
};

type NavSection = {
  title: string;
  items: NavItem[];
};

const navSections: NavSection[] = [
  {
    title: 'Business Operations',
    items: [
      {
        title: 'Dashboard',
        href: '/dashboard',
        icon: LayoutDashboard,
        roles: ['ADMIN', 'STAFF']
      },
      {
        title: 'Clients',
        href: '/clients',
        icon: Building2,
        roles: ['ADMIN']
      },
      {
        title: 'Contracts',
        href: '/contracts',
        icon: FileText,
        roles: ['ADMIN']
      },
      {
        title: 'Invoices',
        href: '/invoices',
        icon: Receipt,
        roles: ['ADMIN']
      },
      {
        title: 'Letters',
        href: '/letters',
        icon: Mail,
        roles: ['ADMIN']
      },
    ],
  },
  {
    title: 'Human Resources',
    items: [
      {
        title: 'Employees',
        href: '/employees',
        icon: Users,
        roles: ['ADMIN', 'STAFF']
      },
      {
        title: 'Attendance',
        href: '/attendance',
        icon: Calendar,
        roles: ['ADMIN', 'STAFF']
      },
      {
        title: 'Leave Management',
        href: '/leave-management',
        icon: FileCheck,
        roles: ['ADMIN', 'STAFF']
      },
      {
        title: 'Business Trip',
        href: '/business-trip',
        icon: Plane,
        roles: ['ADMIN', 'STAFF']
      },
      {
        title: 'Reimbursement',
        href: '/reimbursement',
        icon: Wallet,
        roles: ['ADMIN', 'STAFF']
      },
    ],
  },
  {
    title: 'Settings',
    items: [
      {
        title: 'Users',
        href: '/users',
        icon: UserCog,
        roles: ['ADMIN']
      },
      {
        title: 'Approval Flow',
        href: '/settings/approval-flow',
        icon: GitBranch,
        roles: ['ADMIN']
      },
      {
        title: 'Work Schedule',
        href: '/settings/work-schedule',
        icon: Clock3,
        roles: ['ADMIN']
      },
      {
        title: 'Reimbursement Limit',
        href: '/settings/reimbursement-limit',
        icon: Scale,
        roles: ['ADMIN']
      },
    ],
  },
];

interface AdminSidebarProps {
  variant?: 'default' | 'sheet';
  onNavigate?: () => void;
}

export function AdminSidebar({ variant = 'default', onNavigate }: AdminSidebarProps) {
  const allowCollapse = variant === 'default';
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();
  const { loadingHref, setRouteLoading } = useRouteLoading();
  const { isPlaying, progress, toggle, seek } = useGlobalAudio();

  const isCollapsed = allowCollapse ? collapsed : false;
  const userRole: User['role'] = user?.role === 'STAFF' ? 'STAFF' : 'ADMIN';

  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.roles.includes(userRole)),
    }))
    .filter((section) => section.items.length > 0);

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
        <div className="space-y-4 px-2">
          {visibleSections.map((section) => (
            <div key={section.title}>
              {!isCollapsed && (
                <p className="px-3 pb-1 text-[11px] uppercase tracking-[0.16em] text-sidebar-foreground/65">
                  {section.title}
                </p>
              )}
              <ul className="space-y-1">
                {section.items.map((item) => {
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
            </div>
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border px-4 py-3">
        {isCollapsed ? (
          <button
            onClick={toggle}
            className="mx-auto flex h-9 w-9 items-center justify-center rounded-full border border-sidebar-border text-sidebar-foreground/80 transition hover:text-sidebar-foreground"
            aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
        ) : (
          <div className="flex items-center gap-2 rounded-full border border-sidebar-border/60 bg-sidebar-accent/30 px-2 py-1 text-xs text-sidebar-foreground/80">
            <button
              onClick={toggle}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-sidebar-border text-sidebar-foreground/80 transition hover:text-sidebar-foreground"
              aria-label={isPlaying ? 'Pause audio' : 'Play audio'}
            >
              {isPlaying ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              step={0.5}
              value={progress}
              onInput={(event) => seek(Number(event.currentTarget.value))}
              className="h-1 w-full accent-primary"
              aria-label="Audio seekbar"
            />
          </div>
        )}
      </div>
      <div className="px-4 pb-4 text-[11px] text-sidebar-foreground/70">
        {!isCollapsed ? (
          <div className="rounded-md border border-sidebar-border/60 bg-sidebar-accent/20 px-3 py-2">
            <div className="flex items-center justify-between font-medium text-sidebar-foreground/80">
              <span>IECNET</span>
              <span>© {new Date().getFullYear()}</span>
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-sidebar-foreground/60">
              All rights reserved
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-sidebar-border/60 bg-sidebar-accent/20 px-2 py-2 text-center">
            ©
          </div>
        )}
      </div>
    </aside>
  );
}

