import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Bot,
  Briefcase,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  DoorOpen,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Receipt,
  Settings,
  Share2,
  ShoppingCart,
  TrendingUp,
  User,
  UserCog,
  UserRoundCheck,
  Users,
  WalletCards,
  X
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { canAccessPage, roleLabels } from '../lib/accessControl';
import type { AppUser } from '../services/userService';

interface SidebarProps {
  currentPage: string;
  onPageChange: (page: string) => void;
  isMobileOpen: boolean;
  onMobileToggle: () => void;
  onLogout: () => void;
  currentUser: AppUser | null;
}

interface NavigationItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

const menuItems: NavigationItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'aiAssistant', label: 'AI Assistant', icon: Bot },
  { id: 'cases', label: 'Case Management', icon: FolderKanban },
  { id: 'pos', label: 'New Transaction', icon: ShoppingCart },
  { id: 'clients', label: 'Clients', icon: Users },
  { id: 'transactions', label: 'Transactions', icon: Receipt },
  { id: 'services', label: 'Services', icon: Briefcase },
  { id: 'associates', label: 'Associate/s', icon: UserRoundCheck },
  { id: 'referrals', label: 'Referrals', icon: Share2 },
  { id: 'users', label: 'User Management', icon: UserCog },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings }
];

const schedulingItems: NavigationItem[] = [
  { id: 'scheduleCalendar', label: 'Calendar', icon: CalendarDays },
  { id: 'appointments', label: 'Appointments', icon: ClipboardList },
  { id: 'rooms', label: 'Rooms', icon: DoorOpen },
  {
    id: 'associateAvailability',
    label: 'Associate Availability',
    icon: CalendarClock
  }
];

const financeItems: NavigationItem[] = [
  { id: 'expenses', label: 'Expense Ledger', icon: WalletCards },
  { id: 'profitability', label: 'Profitability', icon: TrendingUp }
];

const groupDefinitions = [
  {
    label: 'Workspace',
    ids: ['dashboard', 'aiAssistant', 'cases', 'clients']
  },
  {
    label: 'Operations',
    ids: ['transactions', 'services', 'associates', 'referrals']
  },
  {
    label: 'Analytics',
    ids: ['reports']
  },
  {
    label: 'Administration',
    ids: ['users', 'settings']
  }
];

const SIDEBAR_EXPANDED_KEY = 'psyzygy-sidebar-expanded';

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onPageChange,
  isMobileOpen,
  onMobileToggle,
  onLogout,
  currentUser
}) => {
  const [isExpanded, setIsExpanded] = useState(() => {
    const savedPreference = window.localStorage.getItem(SIDEBAR_EXPANDED_KEY);
    return savedPreference !== 'false';
  });
  const currentRole = currentUser?.role;
  const displayName =
    currentUser?.full_name || currentUser?.email || 'Signed in user';
  const displayRole = currentRole
    ? roleLabels[currentRole] || currentRole
    : 'User';

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_EXPANDED_KEY, String(isExpanded));
  }, [isExpanded]);

  const visibleMenuItems = menuItems.filter((item) => {
    if (item.id === 'users' && currentRole !== 'admin') return false;
    if (
      item.id === 'aiAssistant'
      && !['admin', 'manager', 'regular_user'].includes(currentRole || '')
    ) {
      return false;
    }

    return canAccessPage(currentRole, item.id);
  });
  const visibleSchedulingItems = schedulingItems.filter((item) =>
    canAccessPage(currentRole, item.id)
  );
  const visibleFinanceItems = ['admin', 'manager'].includes(currentRole || '')
    ? financeItems
    : [];
  const allVisibleItems = [
    ...visibleMenuItems,
    ...visibleSchedulingItems,
    ...visibleFinanceItems
  ];
  const newTransactionItem = visibleMenuItems.find((item) => item.id === 'pos');
  const navigationGroups: NavigationGroup[] = [
    ...groupDefinitions.map((group) => ({
      label: group.label,
      items: visibleMenuItems.filter((item) => group.ids.includes(item.id))
    })),
    {
      label: 'Scheduling',
      items: visibleSchedulingItems
    },
    {
      label: 'Finance',
      items: visibleFinanceItems
    }
  ].filter((group) => group.items.length > 0);

  const navigateTo = (page: string) => {
    onPageChange(page);
    if (isMobileOpen) onMobileToggle();
  };

  return (
    <>
      {isMobileOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-[2px] lg:hidden"
          onClick={onMobileToggle}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(350px,calc(100vw-16px))] overflow-hidden bg-white shadow-2xl transition-[transform,width] duration-300 ease-out lg:static lg:z-auto lg:h-screen lg:shrink-0 lg:translate-x-0 lg:shadow-none ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${isExpanded ? 'lg:w-[340px]' : 'lg:w-[76px]'}`}
      >
        <div className="flex w-[76px] shrink-0 flex-col bg-[#091a33] text-white">
          <div className="flex h-[76px] items-center justify-center border-b border-white/10">
            <button
              type="button"
              onClick={() => setIsExpanded((expanded) => !expanded)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-teal-300/20 bg-gradient-to-br from-teal-400/20 to-cyan-300/5 text-2xl font-semibold text-teal-300 shadow-[0_8px_24px_rgba(15,157,145,0.15)] transition hover:border-teal-300/40 hover:bg-teal-400/25"
              aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
              title={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              Ψ
            </button>
          </div>

          <nav
            aria-label="Compact navigation"
            className="flex-1 overflow-y-auto px-3 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <ul className="space-y-2">
              {allVisibleItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPage === item.id;

                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => navigateTo(item.id)}
                      className={`flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-200 ${
                        isActive
                          ? 'bg-teal-500 text-white shadow-[0_8px_22px_rgba(20,184,166,0.32)]'
                          : 'text-slate-300 hover:bg-white/10 hover:text-white'
                      }`}
                      aria-label={item.label}
                      aria-current={isActive ? 'page' : undefined}
                      title={item.label}
                    >
                      <Icon className="h-5 w-5" strokeWidth={1.8} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="space-y-2 border-t border-white/10 px-3 py-4">
            <button
              type="button"
              onClick={() => setIsExpanded((expanded) => !expanded)}
              className="hidden h-12 w-12 items-center justify-center rounded-xl text-slate-300 transition hover:bg-white/10 hover:text-white lg:flex"
              aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
              title={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              {isExpanded ? (
                <PanelLeftClose className="h-5 w-5" />
              ) : (
                <PanelLeftOpen className="h-5 w-5" />
              )}
            </button>

            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-500/15 text-teal-300"
              title={`${displayName} — ${displayRole}`}
            >
              <User className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div
          className={`flex min-w-0 flex-1 flex-col border-r border-slate-200 bg-[#fbfcfc] transition-opacity duration-200 ${
            isExpanded ? 'lg:opacity-100' : 'lg:pointer-events-none lg:opacity-0'
          }`}
        >
          <div className="flex min-h-[76px] items-center justify-between border-b border-slate-200/80 px-5">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight text-slate-950">
                Psyzygy Clinic
              </h1>
              <p className="text-xs font-medium text-slate-500">
                Point of Sale
              </p>
            </div>

            <button
              type="button"
              onClick={onMobileToggle}
              className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 lg:hidden"
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-5">
            {newTransactionItem && (
              <button
                type="button"
                onClick={() => navigateTo(newTransactionItem.id)}
                className={`mb-6 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-sm transition ${
                  currentPage === newTransactionItem.id
                    ? 'bg-[#087f77] text-white shadow-teal-900/15'
                    : 'bg-[#0f9d91] text-white hover:bg-[#0b8d83] hover:shadow-md'
                }`}
                aria-current={
                  currentPage === newTransactionItem.id ? 'page' : undefined
                }
              >
                <Plus className="h-4 w-4" />
                New Transaction
              </button>
            )}

            <nav aria-label="Primary navigation" className="space-y-6">
              {navigationGroups.map((group) => (
                <section key={group.label}>
                  <h2 className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    {group.label}
                  </h2>

                  <ul className="space-y-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const isActive = currentPage === item.id;

                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => navigateTo(item.id)}
                            className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all ${
                              isActive
                                ? 'bg-teal-50 text-teal-800 shadow-[inset_0_0_0_1px_rgba(13,148,136,0.12)]'
                                : 'text-slate-600 hover:bg-white hover:text-slate-950 hover:shadow-sm'
                            }`}
                            aria-current={isActive ? 'page' : undefined}
                          >
                            {isActive && (
                              <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-teal-500" />
                            )}
                            <Icon
                              className={`h-[18px] w-[18px] shrink-0 ${
                                isActive
                                  ? 'text-teal-600'
                                  : 'text-slate-400 group-hover:text-teal-600'
                              }`}
                              strokeWidth={1.8}
                            />
                            <span className="truncate">{item.label}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </nav>
          </div>

          <div className="border-t border-slate-200/80 p-4">
            <div className="mb-2 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                <User className="h-[18px] w-[18px]" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">
                  {displayName}
                </p>
                <p className="truncate text-xs text-slate-500">{displayRole}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-red-50 hover:text-red-600"
            >
              <LogOut className="h-[18px] w-[18px]" />
              Logout
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
