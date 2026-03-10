import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  LayoutDashboard,
  ClipboardList,
  Factory,
  Sparkles,
  Package,
  Box,
  Warehouse,
  PackageOpen,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  BookOpen,
  Globe,
} from 'lucide-react';

interface NavItem {
  title: string;
  translationKey: string;
  href: string;
  icon: React.ElementType;
  badge?: string;
  badgeColor?: string;
  roles?: string[];
}

const navItems: NavItem[] = [
  { title: 'Dashboard', translationKey: 'nav.dashboard', href: '/', icon: LayoutDashboard },
  { title: 'Orders', translationKey: 'nav.orders', href: '/orders', icon: ClipboardList },
  { title: 'Catalog', translationKey: 'nav.catalog', href: '/catalog', icon: BookOpen },
  { title: 'Manufacturing', translationKey: 'nav.manufacturing', href: '/queues/manufacturing', icon: Factory },
  { title: 'Finishing', translationKey: 'nav.finishing', href: '/queues/finishing', icon: Sparkles },
  { title: 'Packaging', translationKey: 'nav.packaging', href: '/queues/packaging', icon: Package },
  { title: 'Boxing', translationKey: 'nav.boxing', href: '/queues/boxing', icon: Box },
  { title: 'Warehouse', translationKey: 'nav.warehouse', href: '/boxes', icon: Warehouse },
  { title: 'Extra Inventory', translationKey: 'nav.extra_inventory', href: '/extra-inventory', icon: PackageOpen },
  { title: 'Machines', translationKey: 'nav.machines', href: '/machines', icon: Settings, roles: ['admin'] },
  { title: 'Reports & Analytics', translationKey: 'nav.reports', href: '/reports', icon: BarChart3 },
  { title: 'Admin', translationKey: 'nav.admin', href: '/users', icon: Settings, roles: ['admin'] },
];

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  const { user, userRoles, signOut } = useAuth();
  const { t, language, toggleLanguage, isRTL } = useLanguage();

  const roleDisplayNames: Record<string, string> = {
    admin: t('role.admin'),
    manufacturing_manager: t('role.manufacturing_manager'),
    finishing_manager: t('role.finishing_manager'),
    packaging_manager: t('role.packaging_manager'),
    boxing_manager: t('role.boxing_manager'),
  };

  const filteredNavItems = navItems.filter(item => {
    if (!item.roles) return true;
    return item.roles.some(role => userRoles.includes(role as any));
  });

  const isActive = (href: string) => {
    if (href === '/') return location.pathname === '/';
    return location.pathname.startsWith(href);
  };

  // RTL-aware chevrons
  const CollapseIcon = isRTL
    ? (collapsed ? ChevronLeft : ChevronRight)
    : (collapsed ? ChevronRight : ChevronLeft);

  return (
    <div className={cn("flex min-h-screen w-full bg-background", isRTL && "flex-row-reverse")}>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:sticky top-0 z-50 h-screen flex flex-col border-sidebar-border bg-sidebar transition-all duration-300",
          isRTL ? "right-0 border-l" : "left-0 border-r",
          collapsed ? "w-16" : "w-64",
          mobileOpen
            ? "translate-x-0"
            : isRTL
              ? "translate-x-full lg:translate-x-0"
              : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo/Header */}
        <div className={cn(
          "flex items-center h-16 px-4 border-b border-sidebar-border",
          collapsed ? "justify-center" : "gap-3"
        )}>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
            <Factory className="h-5 w-5 text-primary" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="font-bold text-sidebar-foreground truncate">{t('header.miracle_erp')}</h1>
              <p className="text-xs text-muted-foreground truncate">{t('header.production_system')}</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-4">
          <nav className="px-2 space-y-1">
            {filteredNavItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group",
                    active 
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" 
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50",
                    collapsed && "justify-center px-0"
                  )}
                  title={collapsed ? t(item.translationKey) : undefined}
                >
                  <Icon className={cn(
                    "h-5 w-5 shrink-0",
                    active ? "text-primary" : "text-muted-foreground group-hover:text-sidebar-foreground"
                  )} />
                  {!collapsed && (
                    <>
                      <span className="flex-1 truncate">{t(item.translationKey)}</span>
                      {item.badge && (
                        <Badge 
                          variant="secondary" 
                          className={cn("text-xs", item.badgeColor)}
                        >
                          {item.badge}
                        </Badge>
                      )}
                    </>
                  )}
                </Link>
              );
            })}
          </nav>
        </ScrollArea>

        {/* Language toggle + Collapse button */}
        <div className="flex flex-col gap-2 p-2 border-t border-sidebar-border">
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "default"}
            onClick={toggleLanguage}
            className={cn("gap-2 font-medium", collapsed ? "h-8 w-8" : "w-full justify-start")}
            title={language === 'en' ? 'التبديل إلى العربية' : 'Switch to English'}
          >
            <Globe className="h-4 w-4 shrink-0" />
            {!collapsed && (language === 'en' ? 'Arabic' : 'English')}
          </Button>
          <div className="hidden lg:flex justify-end">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed(!collapsed)}
              className="h-8 w-8"
            >
              <CollapseIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top header */}
        <header className={cn(
          "sticky top-0 z-30 flex items-center h-16 px-4 border-b border-border bg-card",
          isRTL ? "flex-row-reverse justify-between" : "justify-between"
        )}>
          {/* Mobile menu trigger — always on the "start" side */}
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>

          {/* Right-side controls — always on "end" side */}
          <div className={cn("flex items-center gap-4", isRTL && "flex-row-reverse")}>
            <div className={cn("hidden sm:block", isRTL ? "text-left" : "text-right")}>
              <p className="text-sm font-medium truncate max-w-[200px]">{user?.email}</p>
            </div>
            <Button variant="outline" size="icon" onClick={signOut} title={t('header.logout')}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
