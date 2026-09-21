import React, { useEffect, useRef, useState } from 'react';
import { AppProvider } from './context/AppContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { supabase } from './lib/supabaseClient';
import type { AppUser } from './services/userService';

import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { POS } from './pages/POS';
import { Clients } from './pages/Clients';
import { Transactions } from './pages/Transactions';
import { Services } from './pages/Services';
import { Reports } from './pages/Reports';
import { Settings } from './pages/Settings';
import { MentalHealthAssociates } from './pages/MentalHealthAssociates';
import { Referrals } from './pages/Referrals';
import { UserManagement } from './pages/UserManagement';
import { ResetPassword } from './pages/ResetPassword';
import { SchedulingCalendar, type SchedulingCalendarState } from './pages/SchedulingCalendar';
import { AppointmentsList } from './pages/AppointmentsList';
import { AppointmentForm } from './pages/AppointmentForm';
import { AppointmentDetails } from './pages/AppointmentDetails';
import { RoomsManagement } from './pages/RoomsManagement';
import { AssociateAvailability } from './pages/AssociateAvailability';
import { AIAssistant } from './pages/AIAssistant';
import { CaseManagementLogin } from './pages/CaseManagementLogin';
import { CaseWorkspace } from './components/CaseWorkspace';
import { Expenses } from './pages/Expenses';
import { Profitability } from './pages/Profitability';
import { GovernmentTransactions } from './pages/GovernmentTransactions';
import {
  canAccessPage,
  caseModuleRoles,
  caseOnlyRoles,
  expenseOnlyRoles,
  getDefaultPageForRole
} from './lib/accessControl';

type AppointmentReturnPage = 'appointments' | 'scheduleCalendar';
type PasswordMode = 'recovery' | 'change' | null;

const hasPasswordRecoveryUrl = () => {
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

  return searchParams.get('type') === 'recovery' || hashParams.get('type') === 'recovery';
};

export default function App() {
  const isCaseManagementRoute =
    window.location.pathname.startsWith('/casemanagement');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [passwordMode, setPasswordMode] = useState<PasswordMode>(null);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [highlightedTransactionId, setHighlightedTransactionId] =
    useState<string | null>(null);
  const [appointmentReturnPage, setAppointmentReturnPage] =
    useState<AppointmentReturnPage>('appointments');
  const [schedulingCalendarState, setSchedulingCalendarState] =
    useState<SchedulingCalendarState | undefined>();
  const profileLoadId = useRef(0);
  const isSigningOut = useRef(false);

  const loadCurrentUser = async (authUserId?: string, email?: string) => {
    const loadId = ++profileLoadId.current;

    if (!authUserId) {
      setCurrentUser(null);
      return;
    }

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (error) {
      console.error('Error loading current user profile:', error);
      if (loadId !== profileLoadId.current) return;

      setCurrentUser({
        id: authUserId,
        auth_user_id: authUserId,
        full_name: email || 'Signed in user',
        email: email || '',
        role: 'regular_user',
        is_active: true,
        must_change_password: false,
        created_at: '',
        updated_at: ''
      });
      return;
    }

    if (loadId !== profileLoadId.current) return;
    setCurrentUser(data as AppUser | null);
  };

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      const isRecoveryLink = hasPasswordRecoveryUrl();

      setIsLoggedIn(Boolean(session));
      setPasswordMode(isRecoveryLink ? 'recovery' : null);
      await loadCurrentUser(session?.user.id, session?.user.email);
      setCheckingSession(false);
    };

    loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          setPasswordMode('recovery');
          setCheckingSession(false);
          return;
        }

        if (event === 'SIGNED_OUT' && isSigningOut.current) {
          setIsLoggedIn(false);
          setCurrentUser(null);
          return;
        }

        setIsLoggedIn(Boolean(session));
        setCheckingSession(false);

        window.setTimeout(() => {
          loadCurrentUser(session?.user.id, session?.user.email);
        }, 0);
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (
      !isCaseManagementRoute &&
      isLoggedIn &&
      currentUser &&
      !canAccessPage(currentUser.role, currentPage)
    ) {
      setCurrentPage(getDefaultPageForRole(currentUser.role));
    }
  }, [currentPage, currentUser?.role, isCaseManagementRoute, isLoggedIn]);

  useEffect(() => {
    if (
      !isCaseManagementRoute
      && isLoggedIn
      && currentUser
      && caseOnlyRoles.includes(currentUser.role)
    ) {
      window.location.replace('/casemanagement');
    }
  }, [currentUser, isCaseManagementRoute, isLoggedIn]);

  useEffect(() => {
    const handleExternalNavigation = (event: Event) => {
      const page = (event as CustomEvent<{ page?: string }>).detail?.page;
      if (page) {
        handlePageChange(page);
      }
    };

    window.addEventListener('psyzygy:navigate', handleExternalNavigation);
    return () => {
      window.removeEventListener('psyzygy:navigate', handleExternalNavigation);
    };
  }, []);

  useEffect(() => {
    if (
      isCaseManagementRoute
      && !checkingSession
      && !isLoggedIn
      && passwordMode !== 'recovery'
      && window.location.pathname !== '/casemanagement/login'
    ) {
      window.history.replaceState(null, '', '/casemanagement/login');
    }
  }, [
    checkingSession,
    isCaseManagementRoute,
    isLoggedIn,
    passwordMode
  ]);

  const handleLogin = async () => {
    const { data } = await supabase.auth.getSession();
    setIsLoggedIn(true);
    await loadCurrentUser(data.session?.user.id, data.session?.user.email);
  };

  const resetSessionState = () => {
    profileLoadId.current += 1;
    setIsLoggedIn(false);
    setCurrentUser(null);
    setCurrentPage(getDefaultPageForRole(currentUser?.role));
    setSelectedAppointmentId(null);
    setAppointmentReturnPage('appointments');
    setSchedulingCalendarState(undefined);
    setIsMobileSidebarOpen(false);
    setPasswordMode(null);
  };

  const handleLogout = async () => {
    isSigningOut.current = true;
    profileLoadId.current += 1;
    setCheckingSession(true);
    setCurrentUser(null);
    setCurrentPage('dashboard');
    setIsMobileSidebarOpen(false);
    setPasswordMode(null);

    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' });

      if (error) {
        console.error('Error signing out:', error);
      }
    } finally {
      isSigningOut.current = false;
      resetSessionState();
      setCheckingSession(false);
    }
  };

  const handlePageChange = (page: string) => {
    setCurrentPage(page);
    if (page !== 'transactions') {
      setHighlightedTransactionId(null);
    }
    if (!['appointmentDetails', 'appointmentEdit'].includes(page)) {
      setSelectedAppointmentId(null);
    }
  };

  const openAppointmentCreate = (
    returnPage: AppointmentReturnPage,
    calendarState?: SchedulingCalendarState
  ) => {
    setSelectedAppointmentId(null);
    setAppointmentReturnPage(returnPage);
    if (calendarState) {
      setSchedulingCalendarState(calendarState);
    }
    setCurrentPage('appointmentCreate');
  };

  const openAppointmentDetails = (
    appointmentId: string,
    returnPage: AppointmentReturnPage,
    calendarState?: SchedulingCalendarState
  ) => {
    setSelectedAppointmentId(appointmentId);
    setAppointmentReturnPage(returnPage);
    if (calendarState) {
      setSchedulingCalendarState(calendarState);
    }
    setCurrentPage('appointmentDetails');
  };

  const toggleMobileSidebar = () => {
    setIsMobileSidebarOpen(!isMobileSidebarOpen);
  };

  const getPageTitle = () => {
    const titles: Record<string, string> = {
      dashboard: 'Dashboard',
      aiAssistant: 'AI Assistant',
      pos: 'New Transaction',
      clients: 'Client Management',
      transactions: 'Transactions',
      services: 'Services Management',
      associates: 'Associate/s',
      referrals: 'Referrals',
      governmentTransactions: 'Government Transaction Mode',
      users: 'User Management',
      reports: 'Reports',
      settings: 'Settings',
      scheduleCalendar: 'Scheduling Calendar',
      appointments: 'Appointments',
      rooms: 'Rooms',
      associateAvailability: 'Associate Availability',
      expenses: 'Expense Ledger',
      profitability: 'Profitability',
      appointmentCreate: 'Create Appointment',
      appointmentEdit: 'Edit Appointment',
      appointmentDetails: 'Appointment Details'
    };

    return titles[currentPage] || 'Dashboard';
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;

      case 'aiAssistant':
        return <AIAssistant currentUser={currentUser} />;

      case 'pos':
        return <POS />;

      case 'clients':
        return <Clients />;

      case 'transactions':
        return (
          <Transactions
            highlightedTransactionId={highlightedTransactionId}
            onHighlightConsumed={() => setHighlightedTransactionId(null)}
          />
        );

      case 'services':
        return <Services />;

      case 'associates':
        return <MentalHealthAssociates />;

      case 'referrals':
        return <Referrals />;

      case 'governmentTransactions':
        return <GovernmentTransactions />;

      case 'users':
        return <UserManagement />;

      case 'reports':
        return <Reports />;

      case 'settings':
        return <Settings />;

      case 'expenses':
        return <Expenses currentUser={currentUser} />;

      case 'profitability':
        return <Profitability />;

      case 'scheduleCalendar':
        return (
          <SchedulingCalendar
            initialState={schedulingCalendarState}
            onStateChange={setSchedulingCalendarState}
            onCreate={(calendarState) =>
              openAppointmentCreate('scheduleCalendar', calendarState)
            }
            onView={(id, calendarState) =>
              openAppointmentDetails(id, 'scheduleCalendar', calendarState)
            }
          />
        );

      case 'appointments':
        return (
          <AppointmentsList
            onCreate={() => openAppointmentCreate('appointments')}
            onView={(id) => openAppointmentDetails(id, 'appointments')}
            onEdit={(id) => {
              setSelectedAppointmentId(id);
              setAppointmentReturnPage('appointments');
              setCurrentPage('appointmentEdit');
            }}
          />
        );

      case 'appointmentCreate':
        return (
          <AppointmentForm
            onBack={() => setCurrentPage(appointmentReturnPage)}
            onSaved={(appointment) => {
              setSelectedAppointmentId(appointment.id);
              setCurrentPage('appointmentDetails');
            }}
          />
        );

      case 'appointmentEdit':
        return (
          <AppointmentForm
            appointmentId={selectedAppointmentId}
            onBack={() => {
              if (selectedAppointmentId) {
                setCurrentPage('appointmentDetails');
              } else {
                setCurrentPage(appointmentReturnPage);
              }
            }}
            onSaved={(appointment) => {
              setSelectedAppointmentId(appointment.id);
              setCurrentPage('appointmentDetails');
            }}
          />
        );

      case 'appointmentDetails':
        return (
          <AppointmentDetails
            appointmentId={selectedAppointmentId}
            onBack={() => setCurrentPage(appointmentReturnPage)}
            onEdit={(id) => {
              setSelectedAppointmentId(id);
              setCurrentPage('appointmentEdit');
            }}
            onOpenTransactions={(transactionId) => {
              setHighlightedTransactionId(transactionId);
              setCurrentPage('transactions');
            }}
          />
        );

      case 'rooms':
        return <RoomsManagement />;

      case 'associateAvailability':
        return <AssociateAvailability />;

      default:
        return <Dashboard />;
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-600">Loading...</p>
      </div>
    );
  }

  if (passwordMode === 'recovery') {
    return (
      <ResetPassword
        mode="recovery"
        onComplete={() => {
          setPasswordMode(null);
          setIsLoggedIn(false);
        }}
      />
    );
  }

  if (!isLoggedIn) {
    return isCaseManagementRoute
      ? <CaseManagementLogin onLogin={handleLogin} />
      : <Login onLogin={handleLogin} />;
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-600">Loading user profile...</p>
      </div>
    );
  }

  if (currentUser?.must_change_password) {
    return (
      <ResetPassword
        mode="required"
        onComplete={async () => {
          const { data } = await supabase.auth.getSession();
          await loadCurrentUser(data.session?.user.id, data.session?.user.email);
        }}
      />
    );
  }

  if (passwordMode === 'change') {
    return (
      <ResetPassword
        mode="change"
        onComplete={() => setPasswordMode(null)}
        onCancel={() => setPasswordMode(null)}
      />
    );
  }

  if (isCaseManagementRoute) {
    if (
      !currentUser.is_active
      || !caseModuleRoles.includes(currentUser.role)
    ) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
            <h1 className="text-xl font-semibold text-slate-900">
              Case workspace access required
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              This account is not authorized to access Case Management.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => window.location.assign('/')}
                className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-teal-700"
              >
                Return to POS Operations
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <CaseWorkspace
        currentUser={currentUser}
        onLogout={handleLogout}
        onChangePassword={() => setPasswordMode('change')}
      />
    );
  }

  if (caseOnlyRoles.includes(currentUser.role)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-sm text-slate-600">
          Opening Case Management...
        </p>
      </div>
    );
  }

  const shouldLoadPosData =
    !currentUser?.role
    || (
      !caseOnlyRoles.includes(currentUser.role)
      && !expenseOnlyRoles.includes(currentUser.role)
    );

  return (
    <AppProvider shouldLoadData={shouldLoadPosData}>
      <div className="flex h-screen overflow-hidden bg-slate-50">
        <Sidebar
          currentPage={currentPage}
          onPageChange={handlePageChange}
          isMobileOpen={isMobileSidebarOpen}
          onMobileToggle={toggleMobileSidebar}
          onLogout={handleLogout}
          currentUser={currentUser}
        />

        <div className="flex-1 flex flex-col overflow-hidden">
          <Header
            title={getPageTitle()}
            onMobileMenuToggle={toggleMobileSidebar}
            currentUser={currentUser}
            onLogout={handleLogout}
            onChangePassword={() => setPasswordMode('change')}
          />

          <main className="flex-1 overflow-y-auto p-6">
            {renderPage()}
          </main>
        </div>
      </div>
    </AppProvider>
  );
}
