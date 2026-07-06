import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Clock,
  FolderKanban,
  KeyRound,
  ListChecks,
  LogOut,
  Menu,
  MonitorUp,
  Plus,
  User,
  Users,
  X
} from 'lucide-react';
import { CaseManagement, type CaseView } from '../pages/CaseManagement';
import { roleLabels } from '../lib/accessControl';
import type { AppUser } from '../services/userService';

interface CaseWorkspaceProps {
  currentUser: AppUser;
  onLogout: () => void | Promise<void>;
  onChangePassword: () => void;
}

interface WorkspaceItem {
  id: CaseView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const primaryItems: WorkspaceItem[] = [
  { id: 'board', label: 'Case Board', icon: FolderKanban },
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'all', label: 'All Cases', icon: ClipboardList },
  { id: 'mine', label: 'My Cases', icon: Users }
];

const workflowItems: WorkspaceItem[] = [
  { id: 'tasks', label: 'Case Tasks', icon: ListChecks },
  { id: 'overdue', label: 'Overdue Cases', icon: AlertTriangle },
  { id: 'review', label: 'For Review', icon: Clock },
  { id: 'release', label: 'Ready for Release', icon: CheckCircle2 }
];

const pageTitles: Partial<Record<CaseView, string>> = {
  board: 'Case Workflow Board',
  dashboard: 'Case Dashboard',
  all: 'All Cases',
  mine: 'My Cases',
  create: 'Create Case',
  details: 'Case Details',
  tasks: 'Case Tasks',
  overdue: 'Overdue Cases',
  review: 'Cases for Review',
  release: 'Ready for Release'
};

export const CaseWorkspace: React.FC<CaseWorkspaceProps> = ({
  currentUser,
  onLogout,
  onChangePassword
}) => {
  const [activeView, setActiveView] = useState<CaseView>('board');
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const canManageCases = ['admin', 'manager', 'case_staff'].includes(
    currentUser.role
  );
  const canOpenPos = ['admin', 'manager'].includes(currentUser.role);

  useEffect(() => {
    if (window.location.pathname !== '/casemanagement') {
      window.history.replaceState(null, '', '/casemanagement');
    }
  }, []);

  const navigate = (view: CaseView) => {
    setActiveView(view);
    setIsMobileOpen(false);
  };

  const renderMenu = (items: WorkspaceItem[]) => (
    <ul className="space-y-1">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeView === item.id;

        return (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => navigate(item.id)}
              className={`relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                isActive
                  ? 'bg-teal-500 text-white shadow-[0_8px_20px_rgba(20,184,166,0.2)]'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {item.label}
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#f4f7f7]">
      {isMobileOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-slate-950/55 backdrop-blur-[2px] lg:hidden"
          onClick={() => setIsMobileOpen(false)}
          aria-label="Close case navigation"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[286px] flex-col bg-[#0b2138] text-white shadow-2xl transition-transform duration-300 lg:static lg:translate-x-0 lg:shadow-none ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex min-h-[82px] items-center justify-between border-b border-white/10 px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-400/15 text-xl font-semibold text-teal-300 ring-1 ring-teal-300/20">
              Ψ
            </div>
            <div>
              <p className="font-semibold">Psyzygy Clinic</p>
              <p className="text-xs text-slate-400">Case Management</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsMobileOpen(false)}
            className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-5">
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
            Cases
          </p>
          {renderMenu(primaryItems)}

          {canManageCases && (
            <button
              type="button"
              onClick={() => navigate('create')}
              className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold transition ${
                activeView === 'create'
                  ? 'border-teal-400 bg-teal-500 text-white'
                  : 'border-teal-400/30 bg-teal-400/10 text-teal-200 hover:bg-teal-400/20'
              }`}
            >
              <Plus className="h-4 w-4" />
              Create Case
            </button>
          )}

          <p className="mb-2 mt-7 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
            Workflow
          </p>
          {renderMenu(workflowItems)}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="mb-3 flex items-center gap-3 rounded-xl bg-white/5 p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-400/15 text-teal-300">
              <User className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {currentUser.full_name || currentUser.email}
              </p>
              <p className="truncate text-xs text-slate-400">
                {roleLabels[currentUser.role]}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-300 transition hover:bg-red-500/10 hover:text-red-200"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex min-h-[72px] items-center justify-between border-b border-slate-200 bg-white px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMobileOpen(true)}
              className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Open case navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold text-slate-900">
                {pageTitles[activeView] || 'Case Management'}
              </h1>
              <p className="hidden text-xs text-slate-500 sm:block">
                Secure clinical operations workspace
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canOpenPos && (
              <button
                type="button"
                onClick={() => window.location.assign('/')}
                className="hidden items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 sm:flex"
              >
                <MonitorUp className="h-4 w-4" />
                POS Operations
              </button>
            )}
            <button
              type="button"
              onClick={onChangePassword}
              className="rounded-xl border border-slate-200 p-2.5 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
              title="Change password"
              aria-label="Change password"
            >
              <KeyRound className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <CaseManagement
            currentUser={currentUser}
            workspaceView={activeView}
            onWorkspaceViewChange={setActiveView}
            showViewNavigation={false}
          />
        </main>
      </div>
    </div>
  );
};
