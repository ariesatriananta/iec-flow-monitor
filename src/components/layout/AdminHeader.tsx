"use client";

import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from '@/lib/api/notifications';
import type { InAppNotification } from '@/types';
import { Search, Sun, Moon, User, LogOut, UserCircle, Menu, Settings, Bell, CheckCheck } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useCallback, useEffect, useState } from 'react';

interface AdminHeaderProps {
  title?: string;
  onOpenSidebar?: () => void;
}

export function AdminHeader({ title, onOpenSidebar }: AdminHeaderProps) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const isDark = theme === 'dark';
  const displayName = user?.employee?.fullName?.trim() || user?.name || '-';
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotificationLoading, setIsNotificationLoading] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    setIsNotificationLoading(true);
    try {
      const result = await fetchNotifications(20, 0);
      setNotifications(result.items);
      setUnreadCount(result.unreadCount);
    } catch {
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setIsNotificationLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    void loadNotifications();
  }, [loadNotifications, user, pathname]);

  const handleLogout = async () => {
    await logout();
    window.location.replace('/login');
  };

  const resolveNotificationPath = (item: InAppNotification) => {
    const query = new URLSearchParams();
    if (item.entityId) query.set('entityId', item.entityId);
    query.set('notif', item.id);

    if (item.entityType === 'LEAVE') {
      const suffix = query.toString();
      return suffix ? `/leave-management?${suffix}` : '/leave-management';
    }
    if (item.entityType === 'BUSINESS_TRIP') {
      const suffix = query.toString();
      return suffix ? `/business-trip?${suffix}` : '/business-trip';
    }
    if (item.entityType === 'REIMBURSEMENT') {
      const suffix = query.toString();
      return suffix ? `/reimbursement?${suffix}` : '/reimbursement';
    }
    return '/dashboard';
  };

  const handleNotificationClick = async (item: InAppNotification) => {
    if (!item.isRead) {
      try {
        await markNotificationRead(item.id);
        setNotifications((prev) =>
          prev.map((entry) =>
            entry.id === item.id
              ? {
                  ...entry,
                  isRead: true,
                  readAt: new Date(),
                }
              : entry
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch {
        // no-op; fallback to navigation
      }
    }
    const target = resolveNotificationPath(item);
    router.push(target);
    router.refresh();
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications((prev) =>
        prev.map((entry) => ({
          ...entry,
          isRead: true,
          readAt: entry.readAt ?? new Date(),
        }))
      );
      setUnreadCount(0);
    } catch {
      // no-op
    }
  };

  return (
    <header className="h-16 border-b border-border bg-card px-4 md:px-6 flex items-center justify-between sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onOpenSidebar}
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </Button>
        {title && (
          <h1 className="text-lg md:text-xl font-semibold text-foreground">{title}</h1>
        )}
      </div>

      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search..."
            className="w-64 pl-9 bg-background"
          />
        </div>

        {/* Theme Toggle */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(isDark ? 'light' : 'dark')}
          aria-label="Toggle theme"
        >
          {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </Button>

        <DropdownMenu onOpenChange={(open) => open && void loadNotifications()}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[360px] p-0">
            <div className="flex items-center justify-between px-3 py-2">
              <DropdownMenuLabel className="p-0">Notifikasi</DropdownMenuLabel>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                disabled={unreadCount === 0}
                onClick={handleMarkAllRead}
              >
                <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
                Mark all read
              </Button>
            </div>
            <DropdownMenuSeparator className="m-0" />
            <ScrollArea className="max-h-80">
              <div className="p-1">
                {isNotificationLoading ? (
                  <p className="px-2 py-6 text-center text-sm text-muted-foreground">Memuat notifikasi...</p>
                ) : notifications.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-muted-foreground">Belum ada notifikasi.</p>
                ) : (
                  notifications.map((item) => (
                    <DropdownMenuItem
                      key={item.id}
                      onClick={() => void handleNotificationClick(item)}
                      className={`mb-1 flex flex-col items-start rounded-md px-2 py-2 focus:bg-accent/80 ${
                        item.isRead ? 'opacity-80' : 'bg-primary/5'
                      }`}
                    >
                      <div className="flex w-full items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-tight">{item.title}</p>
                        {!item.isRead && <span className="mt-1 h-2 w-2 rounded-full bg-primary" />}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.message}</p>
                    </DropdownMenuItem>
                  ))
                )}
              </div>
            </ScrollArea>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                <User className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="hidden md:inline font-medium">{displayName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span>{displayName}</span>
                {user?.employee ? (
                  <span className="text-xs text-muted-foreground font-normal">
                    {user.employee.title ?? "-"} - {user.employee.department ?? "-"}
                  </span>
                ) : null}
                <span className="text-xs text-muted-foreground font-normal">
                  {user?.username ? `Username: ${user.username}` : ''}
                </span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/profile')}>
              <UserCircle className="w-4 h-4 mr-2" />
              My Profile
            </DropdownMenuItem>
            {user?.role === 'ADMIN' && (
              <>
                <DropdownMenuItem onClick={() => router.push('/settings')}>
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={handleLogout} className="text-destructive">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
