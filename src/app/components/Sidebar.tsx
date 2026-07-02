import React from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Receipt,
  Briefcase,
  BarChart3,
  Settings,
  LogOut,
  X,
  UserCog,
  UserRoundCheck,
  Share2,
  CalendarDays,
  CalendarClock,
  DoorOpen,
  ClipboardList,
  Bot,
  FolderKanban,
  WalletCards,
  TrendingUp
} from 'lucide-react';
import { canAccessPage } from '../lib/accessControl';
import type { AppUser } from '../services/userService';

interface SidebarProps {
  currentPage: string;
  onPageChange: (page: string) => void;
  isMobileOpen: boolean;
  onMobileToggle: () => void;
  onLogout: () => void;
  currentUser: AppUser | null;
}

const menuItems = [
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

const schedulingItems = [
  { id: 'scheduleCalendar', label: 'Calendar', icon: CalendarDays },
  { id: 'appointments', label: 'Appointments', icon: ClipboardList },
  { id: 'rooms', label: 'Rooms', icon: DoorOpen },
  { id: 'associateAvailability', label: 'Associate Availability', icon: CalendarClock }
];

const financeItems = [
  { id: 'expenses', label: 'Expense Ledger', icon: WalletCards },
  { id: 'profitability', label: 'Profitability', icon: TrendingUp }
];

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onPageChange,
  isMobileOpen,
  onMobileToggle,
  onLogout,
  currentUser
}) => {
  const currentRole = currentUser?.role;
  const visibleMenuItems = menuItems.filter((item) => {
    if (item.id === 'users' && currentRole !== 'admin') return false;
    if (item.id === 'aiAssistant' && !['admin', 'manager', 'regular_user'].includes(currentRole || '')) {
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

  const renderMenuButton = (item: typeof menuItems[number]) => {
    const Icon = item.icon;
    const isActive = currentPage === item.id;

    return (
      <li key={item.id}>
        <button
          onClick={() => {
            onPageChange(item.id);
            if (isMobileOpen) onMobileToggle();
          }}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left ${
            isActive
              ? 'bg-teal-600 text-white'
              : 'text-slate-300 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <Icon className="w-5 h-5 shrink-0" />
          <span className="text-sm">{item.label}</span>
        </button>
      </li>
    );
  };

  return (
    <>
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onMobileToggle}
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-72 bg-slate-900 text-white flex flex-col transition-transform duration-300 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Psyzygy Clinic</h1>
            <p className="text-xs text-slate-400">Point of Sale</p>
          </div>

          <button
            onClick={onMobileToggle}
            className="lg:hidden p-1 rounded hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          <ul className="space-y-1">
            {visibleMenuItems.map(renderMenuButton)}
          </ul>

          {visibleSchedulingItems.length > 0 && (
            <>
              <div className="mt-5 mb-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Scheduling
              </div>

              <ul className="space-y-1">
                {visibleSchedulingItems.map(renderMenuButton)}
              </ul>
            </>
          )}

          {visibleFinanceItems.length > 0 && (
            <>
              <div className="mt-5 mb-2 px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Finance
              </div>

              <ul className="space-y-1">
                {visibleFinanceItems.map(renderMenuButton)}
              </ul>
            </>
          )}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
};
