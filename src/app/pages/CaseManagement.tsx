import React from 'react';
import { ClipboardList, FileClock, FolderKanban } from 'lucide-react';
import { Badge } from '../components/Badge';
import { Card } from '../components/Card';
import { roleLabels } from '../lib/accessControl';
import type { AppUser } from '../services/userService';

interface CaseManagementProps {
  currentUser: AppUser | null;
}

export const CaseManagement: React.FC<CaseManagementProps> = ({ currentUser }) => {
  const role = currentUser?.role;
  const canEditCases = role === 'admin' || role === 'manager' || role === 'case_staff';
  const canEditAssignedTasks = role === 'associate_user';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">
            Case Management
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Track assessment cases, progress history, and assigned case tasks.
          </p>
        </div>
        {role && <Badge variant="info">{roleLabels[role]}</Badge>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5">
          <FolderKanban className="w-6 h-6 text-teal-600 mb-3" />
          <h3 className="font-semibold text-slate-900">Cases</h3>
          <p className="text-sm text-slate-500 mt-1">
            {canEditCases
              ? 'Create cases, assign associates, and update case statuses.'
              : 'View case records available to your role.'}
          </p>
        </Card>

        <Card className="p-5">
          <FileClock className="w-6 h-6 text-teal-600 mb-3" />
          <h3 className="font-semibold text-slate-900">Progress</h3>
          <p className="text-sm text-slate-500 mt-1">
            View status history and case progress notes without payment details.
          </p>
        </Card>

        <Card className="p-5">
          <ClipboardList className="w-6 h-6 text-teal-600 mb-3" />
          <h3 className="font-semibold text-slate-900">Tasks</h3>
          <p className="text-sm text-slate-500 mt-1">
            {canEditAssignedTasks
              ? 'Update assigned case tasks and progress remarks.'
              : 'Review and manage case task assignments according to access.'}
          </p>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="text-lg font-semibold text-slate-900">
          Case workflows are ready for UI build-out
        </h3>
        <p className="text-sm text-slate-500 mt-2">
          Backend APIs and role-based access are in place. The detailed case list,
          forms, and task workflow can now be connected without exposing POS
          payment, pricing, settings, audit, or sales report modules to case-only
          users.
        </p>
      </Card>
    </div>
  );
};
