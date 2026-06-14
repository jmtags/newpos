import type { UserRole } from '../services/userService';

export const roleLabels: Record<UserRole, string> = {
  admin: 'Administrator',
  manager: 'Manager',
  case_staff: 'Case Staff',
  associate_user: 'Associate User',
  case_viewer: 'Case Viewer',
  regular_user: 'Regular User'
};

export const fullAccessRoles: UserRole[] = ['admin', 'manager'];
export const caseModuleRoles: UserRole[] = [
  'admin',
  'manager',
  'case_staff',
  'associate_user',
  'case_viewer'
];
export const caseOnlyRoles: UserRole[] = [
  'case_staff',
  'associate_user',
  'case_viewer'
];

export const canAccessPage = (role: UserRole | undefined, page: string) => {
  if (!role) return false;

  if (fullAccessRoles.includes(role)) return true;

  if (caseOnlyRoles.includes(role)) {
    return page === 'cases';
  }

  if (role === 'regular_user') {
    return [
      'dashboard',
      'aiAssistant',
      'pos',
      'clients',
      'transactions',
      'services',
      'associates',
      'referrals',
      'reports',
      'scheduleCalendar',
      'appointments',
      'rooms',
      'associateAvailability',
      'appointmentCreate',
      'appointmentEdit',
      'appointmentDetails'
    ].includes(page);
  }

  return false;
};

export const getDefaultPageForRole = (role: UserRole | undefined) => {
  if (role && caseOnlyRoles.includes(role)) return 'cases';
  return 'dashboard';
};
