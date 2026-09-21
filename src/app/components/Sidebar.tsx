import React from 'react';
import {
  BarChart3,
  Bot,
  Briefcase,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  DoorOpen,
  Landmark,
  LayoutDashboard,
  LogOut,
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
  { id: 'pos', label: 'New Transaction', icon: ShoppingCart },
  { id: 'clients', label: 'Clients', icon: Users },
  { id: 'transactions', label: 'Transactions', icon: Receipt },
  { id: 'services', label: 'Services', icon: Briefcase },
  { id: 'associates', label: 'Associate/s', icon: UserRoundCheck },
  { id: 'referrals', label: 'Referrals', icon: Share2 },
  { id: 'governmentTransactions', label: 'Government Mode', icon: Landmark },
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
    ids: ['dashboard', 'aiAssistant', 'clients']
  },
  {
    label: 'Operations',
    ids: [
      'transactions',
      'services',
      'associates',
      'referrals',
      'governmentTransactions'
    ]
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

const iconTileClasses: Record<string, string> = {
  dashboard: 'bg-teal-100 text-teal-700',
  aiAssistant: 'bg-violet-100 text-violet-700',
  clients: 'bg-orange-100 text-orange-700',
  transactions: 'bg-emerald-100 text-emerald-700',
  services: 'bg-sky-100 text-sky-700',
  associates: 'bg-cyan-100 text-cyan-700',
  referrals: 'bg-amber-100 text-amber-700',
  governmentTransactions: 'bg-emerald-100 text-emerald-700',
  reports: 'bg-teal-100 text-teal-700',
  scheduleCalendar: 'bg-blue-100 text-blue-700',
  appointments: 'bg-purple-100 text-purple-700',
  rooms: 'bg-rose-100 text-rose-700',
  associateAvailability: 'bg-lime-100 text-lime-700',
  expenses: 'bg-orange-100 text-orange-700',
  profitability: 'bg-emerald-100 text-emerald-700',
  users: 'bg-indigo-100 text-indigo-700',
  settings: 'bg-slate-200 text-slate-700'
};

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onPageChange,
  isMobileOpen,
  onMobileToggle,
  onLogout,
  currentUser
}) => {
  const currentRole = currentUser?.role;
  const displayName =
    currentUser?.full_name || currentUser?.email || 'Signed in user';
  const displayRole = currentRole
    ? roleLabels[currentRole] || currentRole
    : 'User';
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
  const visibleFinanceItems =
    currentRole === 'expense_user'
      ? financeItems.filter((item) => item.id === 'expenses')
      : ['admin', 'manager'].includes(currentRole || '')
        ? financeItems
        : [];
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
          className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-[2px] lg:hidden"
          onClick={onMobileToggle}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(312px,calc(100vw-16px))] flex-col overflow-hidden border-r border-[#e8e3d9] bg-[#fcfaf5] shadow-2xl transition-transform duration-300 ease-out lg:static lg:z-auto lg:h-screen lg:w-[304px] lg:shrink-0 lg:translate-x-0 lg:shadow-[8px_0_28px_rgba(50,55,60,0.035)] ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex min-h-[88px] items-center justify-between border-b border-[#ebe6dc] px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-teal-100 text-2xl font-semibold text-teal-700 shadow-[inset_0_0_0_1px_rgba(13,148,136,0.12)]">
              Ψ
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight text-[#14233c]">
                Psyzygy Clinic
              </h1>
              <p className="text-xs font-medium text-slate-500">
                Point of Sale
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onMobileToggle}
            className="rounded-xl p-2 text-slate-500 transition hover:bg-white hover:text-slate-900 lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5 [scrollbar-color:#d9d4c9_transparent] [scrollbar-width:thin]">
          {newTransactionItem && (
            <button
              type="button"
              onClick={() => navigateTo(newTransactionItem.id)}
              className={`mb-6 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-all ${
                currentPage === newTransactionItem.id
                  ? 'border-teal-500 bg-teal-600 text-white shadow-[0_8px_20px_rgba(13,148,136,0.2)]'
                  : 'border-teal-200 bg-teal-50/80 text-teal-800 hover:border-teal-300 hover:bg-teal-100'
              }`}
              aria-current={
                currentPage === newTransactionItem.id ? 'page' : undefined
              }
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full border ${
                  currentPage === newTransactionItem.id
                    ? 'border-white/40 bg-white/10'
                    : 'border-teal-300 bg-white/70'
                }`}
              >
                <Plus className="h-3.5 w-3.5" />
              </span>
              New Transaction
            </button>
          )}

          <nav aria-label="Primary navigation" className="space-y-6">
            {navigationGroups.map((group) => (
              <section key={group.label}>
                <div className="mb-2 flex items-center gap-3 px-2">
                  <h2 className="shrink-0 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                    {group.label}
                  </h2>
                  <span className="h-px flex-1 bg-[#e7e1d6]" />
                </div>

                <ul className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentPage === item.id;

                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => navigateTo(item.id)}
                          className={`group relative flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm font-medium transition-all ${
                            isActive
                              ? 'bg-[#e5f3ef] text-[#145e59] shadow-[inset_0_0_0_1px_rgba(13,148,136,0.08)]'
                              : 'text-slate-600 hover:bg-white/80 hover:text-slate-950 hover:shadow-[0_3px_12px_rgba(50,55,60,0.04)]'
                          }`}
                          aria-current={isActive ? 'page' : undefined}
                        >
                          {isActive && (
                            <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-teal-500" />
                          )}
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105 ${
                              iconTileClasses[item.id]
                              || 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            <Icon className="h-4 w-4" strokeWidth={1.8} />
                          </span>
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

        <div className="border-t border-[#ebe6dc] bg-[#faf7f1] p-4">
          <div className="mb-2 flex items-center gap-3 rounded-xl border border-[#e8e2d8] bg-white/75 p-3 shadow-[0_4px_16px_rgba(50,55,60,0.04)]">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700 ring-4 ring-white">
              <User className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#14233c]">
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
      </aside>
    </>
  );
};
