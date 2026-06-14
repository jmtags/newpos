import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Eye,
  FileCheck2,
  FolderKanban,
  ListChecks,
  Plus,
  RefreshCw,
  Search
} from 'lucide-react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import {
  CASE_STATUSES,
  CASE_TASK_STATUSES,
  CaseRecord,
  CaseStatus,
  CaseTask,
  CaseTaskStatus,
  CaseFormOptions,
  caseManagementService
} from '../services/caseManagement.service';
import type { AppUser } from '../services/userService';

interface CaseManagementProps {
  currentUser: AppUser | null;
}

type CaseView =
  | 'dashboard'
  | 'all'
  | 'mine'
  | 'create'
  | 'details'
  | 'tasks'
  | 'overdue'
  | 'review'
  | 'release';

const statusBadgeVariant = (status: string): 'success' | 'warning' | 'danger' | 'info' | 'default' => {
  if (['Released', 'Closed', 'Completed'].includes(status)) return 'success';
  if (['For Review', 'For Revision', 'Ready for Release'].includes(status)) return 'warning';
  if (['Cancelled', 'Overdue'].includes(status)) return 'danger';
  if (['Testing Ongoing', 'Scoring', 'Interpretation', 'Report Writing'].includes(status)) {
    return 'info';
  }
  return 'default';
};

const formatDate = (date?: string | null) => {
  if (!date) return '-';
  return new Date(`${date}T00:00:00`).toLocaleDateString();
};

const getDaysText = (targetDate?: string | null) => {
  if (!targetDate) return '-';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${targetDate}T00:00:00`);
  const diff = Math.ceil((target.getTime() - today.getTime()) / 86400000);

  if (diff < 0) return `${Math.abs(diff)} day${Math.abs(diff) === 1 ? '' : 's'} overdue`;
  if (diff === 0) return 'Due today';
  return `${diff} day${diff === 1 ? '' : 's'} remaining`;
};

const isOverdue = (caseItem: CaseRecord) => {
  if (!caseItem.target_release_date) return false;
  if (['Released', 'Closed', 'Cancelled'].includes(caseItem.status)) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${caseItem.target_release_date}T00:00:00`) < today;
};

const isOpenTask = (task: CaseTask) =>
  !['Completed', 'Cancelled'].includes(task.status);

export const CaseManagement: React.FC<CaseManagementProps> = ({ currentUser }) => {
  const [activeView, setActiveView] = useState<CaseView>('dashboard');
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [tasks, setTasks] = useState<CaseTask[]>([]);
  const [selectedCase, setSelectedCase] = useState<CaseRecord | null>(null);
  const [progressLogs, setProgressLogs] = useState<any[]>([]);
  const [formOptions, setFormOptions] = useState<CaseFormOptions>({
    clients: [],
    services: [],
    associates: []
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [progressNote, setProgressNote] = useState('');
  const [newStatus, setNewStatus] = useState<CaseStatus>('New');
  const [newAssociateId, setNewAssociateId] = useState('');
  const [caseForm, setCaseForm] = useState({
    client_id: '',
    service_id: '',
    associate_id: '',
    case_type: 'Assessment',
    status: 'New' as CaseStatus,
    priority: 'Normal' as CaseRecord['priority'],
    target_release_date: '',
    presenting_concern: '',
    internal_notes: ''
  });
  const [taskForm, setTaskForm] = useState({
    case_id: '',
    title: '',
    description: '',
    assigned_to_associate_id: '',
    due_date: '',
    status: 'Pending' as CaseTaskStatus
  });

  const role = currentUser?.role;
  const canViewPayment = ['admin', 'manager', 'case_staff'].includes(role || '');
  const canManageCases = ['admin', 'manager', 'case_staff'].includes(role || '');
  const canEditTasks = ['admin', 'manager', 'case_staff', 'associate_user'].includes(role || '');
  const canAddProgress = ['admin', 'manager', 'case_staff', 'associate_user'].includes(role || '');

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      const [caseRows, taskRows] = await Promise.all([
        caseManagementService.listCases(),
        caseManagementService.listTasks()
      ]);

      setCases(caseRows);
      setTasks(taskRows);

      if (canManageCases) {
        const options = await caseManagementService.getFormOptions();
        setFormOptions(options);
      }
    } catch (err: any) {
      setError(err.message || 'Unable to load cases.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [role]);

  const loadCaseDetails = async (caseItem: CaseRecord) => {
    setSelectedCase(caseItem);
    setNewStatus(caseItem.status);
    setNewAssociateId(caseItem.associate_id || '');
    setActiveView('details');

    try {
      const logs = await caseManagementService.listProgressLogs(caseItem.id);
      setProgressLogs(logs);
    } catch (err: any) {
      setError(err.message || 'Unable to load case progress.');
    }
  };

  const filteredCases = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    if (!normalized) return cases;

    return cases.filter((caseItem) =>
      [
        caseItem.case_number,
        caseItem.client_name,
        caseItem.service_name,
        caseItem.associate_name,
        caseItem.status
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized))
    );
  }, [cases, searchTerm]);

  const overdueCases = useMemo(() => cases.filter(isOverdue), [cases]);
  const reviewCases = useMemo(
    () => cases.filter((caseItem) => caseItem.status === 'For Review'),
    [cases]
  );
  const releaseCases = useMemo(
    () => cases.filter((caseItem) => caseItem.status === 'Ready for Release'),
    [cases]
  );
  const openCases = useMemo(
    () => cases.filter((caseItem) => !['Released', 'Closed', 'Cancelled'].includes(caseItem.status)),
    [cases]
  );
  const caseTasks = useMemo(
    () => tasks.filter((task) => task.case_id === selectedCase?.id),
    [selectedCase?.id, tasks]
  );
  const visibleTasks = useMemo(() => {
    if (activeView !== 'tasks') return tasks;
    return tasks;
  }, [activeView, tasks]);

  const handleCreateCase = async () => {
    if (!caseForm.client_id) {
      setError('Please select a client.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      const created = await caseManagementService.createCase({
        ...caseForm,
        service_id: caseForm.service_id || null,
        associate_id: caseForm.associate_id || null,
        target_release_date: caseForm.target_release_date || null,
        presenting_concern: caseForm.presenting_concern || null,
        internal_notes: caseForm.internal_notes || null
      });

      setCases((current) => [created, ...current]);
      setCaseForm({
        client_id: '',
        service_id: '',
        associate_id: '',
        case_type: 'Assessment',
        status: 'New',
        priority: 'Normal',
        target_release_date: '',
        presenting_concern: '',
        internal_notes: ''
      });
      await loadCaseDetails(created);
    } catch (err: any) {
      setError(err.message || 'Unable to create case.');
    } finally {
      setSaving(false);
    }
  };

  const refreshSelectedCase = (updated: CaseRecord) => {
    setCases((current) =>
      current.map((caseItem) => (caseItem.id === updated.id ? updated : caseItem))
    );
    setSelectedCase(updated);
  };

  const handleUpdateStatus = async () => {
    if (!selectedCase) return;

    try {
      setSaving(true);
      const updated = await caseManagementService.updateCaseStatus(
        selectedCase.id,
        newStatus,
        statusNote || null
      );
      refreshSelectedCase(updated);
      setStatusNote('');
      setProgressLogs(await caseManagementService.listProgressLogs(updated.id));
    } catch (err: any) {
      setError(err.message || 'Unable to update status.');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignAssociate = async () => {
    if (!selectedCase) return;

    try {
      setSaving(true);
      const updated = await caseManagementService.assignAssociate(
        selectedCase.id,
        newAssociateId || null,
        'Associate assignment updated'
      );
      refreshSelectedCase(updated);
      setProgressLogs(await caseManagementService.listProgressLogs(updated.id));
    } catch (err: any) {
      setError(err.message || 'Unable to assign associate.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddProgressNote = async () => {
    if (!selectedCase || !progressNote.trim()) return;

    try {
      setSaving(true);
      await caseManagementService.addProgressNote(selectedCase.id, progressNote.trim());
      setProgressNote('');
      setProgressLogs(await caseManagementService.listProgressLogs(selectedCase.id));
    } catch (err: any) {
      setError(err.message || 'Unable to add progress note.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateTask = async () => {
    if (!taskForm.case_id || !taskForm.title.trim()) {
      setError('Please select a case and enter a task title.');
      return;
    }

    try {
      setSaving(true);
      const created = await caseManagementService.createTask({
        case_id: taskForm.case_id,
        title: taskForm.title.trim(),
        description: taskForm.description || null,
        assigned_to_associate_id: taskForm.assigned_to_associate_id || null,
        due_date: taskForm.due_date || null,
        status: taskForm.status
      });
      setTasks((current) => [created, ...current]);
      setTaskForm({
        case_id: '',
        title: '',
        description: '',
        assigned_to_associate_id: '',
        due_date: '',
        status: 'Pending'
      });
    } catch (err: any) {
      setError(err.message || 'Unable to create task.');
    } finally {
      setSaving(false);
    }
  };

  const handleTaskStatus = async (task: CaseTask, status: CaseTaskStatus) => {
    try {
      setSaving(true);
      const updated =
        status === 'Completed'
          ? await caseManagementService.completeTask(task.id)
          : await caseManagementService.updateTask(task.id, { status });
      setTasks((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
    } catch (err: any) {
      setError(err.message || 'Unable to update task.');
    } finally {
      setSaving(false);
    }
  };

  const renderViewButton = (
    id: CaseView,
    label: string,
    Icon: React.ComponentType<{ className?: string }>,
    count?: number
  ) => (
    <button
      type="button"
      onClick={() => setActiveView(id)}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
        activeView === id
          ? 'bg-teal-600 border-teal-600 text-white'
          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
      }`}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
      {typeof count === 'number' && (
        <span
          className={`ml-1 rounded-full px-2 py-0.5 text-xs ${
            activeView === id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
          }`}
        >
          {count}
        </span>
      )}
    </button>
  );

  const renderCaseTable = (rows: CaseRecord[], title: string) => (
    <Card>
      <div className="p-4 border-b border-slate-200 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <div className="relative w-full lg:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search cases"
            className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1050px]">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {[
                'Case',
                'Client',
                'Service',
                'Associate',
                'Case Status',
                'Report Status',
                'Target Release',
                'Timeline',
                ...(canViewPayment ? ['Payment'] : []),
                ''
              ].map((header) => (
                <th
                  key={header}
                  className="text-left py-3 px-4 text-sm font-medium text-slate-600"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((caseItem) => (
              <tr key={caseItem.id} className="border-b border-slate-100">
                <td className="py-3 px-4">
                  <button
                    type="button"
                    onClick={() => loadCaseDetails(caseItem)}
                    className="font-medium text-teal-700 hover:text-teal-800"
                  >
                    {caseItem.case_number}
                  </button>
                </td>
                <td className="py-3 px-4 text-sm text-slate-700">
                  {caseItem.client_name || '-'}
                </td>
                <td className="py-3 px-4 text-sm text-slate-700">
                  {caseItem.service_name || '-'}
                </td>
                <td className="py-3 px-4 text-sm text-slate-700">
                  {caseItem.associate_name || 'Unassigned'}
                </td>
                <td className="py-3 px-4">
                  <Badge variant={statusBadgeVariant(caseItem.status)}>
                    {caseItem.status}
                  </Badge>
                </td>
                <td className="py-3 px-4">
                  <Badge variant={statusBadgeVariant(caseItem.report_status || caseItem.status)}>
                    {caseItem.report_status || caseItem.status}
                  </Badge>
                </td>
                <td className="py-3 px-4 text-sm text-slate-700">
                  {formatDate(caseItem.target_release_date)}
                </td>
                <td className="py-3 px-4">
                  <Badge variant={isOverdue(caseItem) ? 'danger' : 'default'}>
                    {getDaysText(caseItem.target_release_date)}
                  </Badge>
                </td>
                {canViewPayment && (
                  <td className="py-3 px-4">
                    <Badge variant={caseItem.payment_status === 'Paid' ? 'success' : 'warning'}>
                      {caseItem.payment_status || '-'}
                    </Badge>
                  </td>
                )}
                <td className="py-3 px-4 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => loadCaseDetails(caseItem)}
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={canViewPayment ? 10 : 9}
                  className="py-8 text-center text-slate-500"
                >
                  No cases found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );

  const renderDashboard = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Open Cases', value: openCases.length, icon: FolderKanban },
          { label: 'Overdue', value: overdueCases.length, icon: AlertTriangle },
          { label: 'For Review', value: reviewCases.length, icon: FileCheck2 },
          { label: 'Ready for Release', value: releaseCases.length, icon: CheckCircle2 }
        ].map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.label} className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">{item.label}</p>
                  <p className="text-2xl font-semibold text-slate-900 mt-1">
                    {item.value}
                  </p>
                </div>
                <Icon className="w-7 h-7 text-teal-600" />
              </div>
            </Card>
          );
        })}
      </div>

      {renderCaseTable(filteredCases.slice(0, 8), 'Recent Cases')}
    </div>
  );

  const renderCreateCase = () => (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-5">Create Case</h3>
      {!canManageCases ? (
        <p className="text-sm text-slate-500">You do not have access to create cases.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="Client"
            value={caseForm.client_id}
            onChange={(event) =>
              setCaseForm({ ...caseForm, client_id: event.target.value })
            }
            options={[
              { value: '', label: 'Select client' },
              ...formOptions.clients.map((client) => ({
                value: client.id,
                label: `${client.full_name} (${client.client_code})`
              }))
            ]}
          />
          <Select
            label="Service"
            value={caseForm.service_id}
            onChange={(event) =>
              setCaseForm({ ...caseForm, service_id: event.target.value })
            }
            options={[
              { value: '', label: 'Select service' },
              ...formOptions.services.map((service) => ({
                value: service.id,
                label: service.name
              }))
            ]}
          />
          <Select
            label="Assigned Associate"
            value={caseForm.associate_id}
            onChange={(event) =>
              setCaseForm({ ...caseForm, associate_id: event.target.value })
            }
            options={[
              { value: '', label: 'Unassigned' },
              ...formOptions.associates.map((associate) => ({
                value: associate.id,
                label: associate.full_name
              }))
            ]}
          />
          <Select
            label="Status"
            value={caseForm.status}
            onChange={(event) =>
              setCaseForm({ ...caseForm, status: event.target.value as CaseStatus })
            }
            options={CASE_STATUSES.map((status) => ({ value: status, label: status }))}
          />
          <Select
            label="Priority"
            value={caseForm.priority}
            onChange={(event) =>
              setCaseForm({
                ...caseForm,
                priority: event.target.value as CaseRecord['priority']
              })
            }
            options={['Low', 'Normal', 'High', 'Urgent'].map((priority) => ({
              value: priority,
              label: priority
            }))}
          />
          <Input
            type="date"
            label="Target Release Date"
            value={caseForm.target_release_date}
            onChange={(event) =>
              setCaseForm({ ...caseForm, target_release_date: event.target.value })
            }
          />
          <div className="md:col-span-2">
            <Input
              label="Presenting Concern"
              value={caseForm.presenting_concern}
              onChange={(event) =>
                setCaseForm({ ...caseForm, presenting_concern: event.target.value })
              }
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Internal Remarks
            </label>
            <textarea
              value={caseForm.internal_notes}
              onChange={(event) =>
                setCaseForm({ ...caseForm, internal_notes: event.target.value })
              }
              rows={4}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div className="md:col-span-2 flex justify-end">
            <Button onClick={handleCreateCase} disabled={saving}>
              <Plus className="w-4 h-4 mr-2" />
              {saving ? 'Creating...' : 'Create Case'}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );

  const renderTasks = (taskRows: CaseTask[], title = 'Case Tasks') => (
    <Card>
      <div className="p-4 border-b border-slate-200">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="divide-y divide-slate-100">
        {taskRows.map((task) => (
          <div key={task.id} className="p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-slate-900">{task.title}</h4>
                <Badge variant={statusBadgeVariant(task.status)}>{task.status}</Badge>
              </div>
              <p className="text-sm text-slate-500 mt-1">{task.description || '-'}</p>
              <p className="text-xs text-slate-500 mt-1">
                Due {formatDate(task.due_date)} · {task.assigned_to_associate_name || 'Unassigned'}
              </p>
            </div>
            {canEditTasks && isOpenTask(task) && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleTaskStatus(task, 'In Progress')}
                  disabled={saving}
                >
                  In Progress
                </Button>
                <Button
                  size="sm"
                  variant="success"
                  onClick={() => handleTaskStatus(task, 'Completed')}
                  disabled={saving}
                >
                  Complete
                </Button>
              </div>
            )}
          </div>
        ))}
        {taskRows.length === 0 && (
          <p className="p-6 text-center text-sm text-slate-500">No tasks found.</p>
        )}
      </div>
    </Card>
  );

  const renderTaskCreate = () => {
    if (!canManageCases) return null;

    return (
      <Card className="p-5">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Add Task</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select
            label="Case"
            value={taskForm.case_id}
            onChange={(event) => setTaskForm({ ...taskForm, case_id: event.target.value })}
            options={[
              { value: '', label: 'Select case' },
              ...cases.map((caseItem) => ({
                value: caseItem.id,
                label: `${caseItem.case_number} - ${caseItem.client_name || 'Client'}`
              }))
            ]}
          />
          <Input
            label="Task Title"
            value={taskForm.title}
            onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })}
          />
          <Select
            label="Assigned Associate"
            value={taskForm.assigned_to_associate_id}
            onChange={(event) =>
              setTaskForm({ ...taskForm, assigned_to_associate_id: event.target.value })
            }
            options={[
              { value: '', label: 'Unassigned' },
              ...formOptions.associates.map((associate) => ({
                value: associate.id,
                label: associate.full_name
              }))
            ]}
          />
          <Input
            type="date"
            label="Due Date"
            value={taskForm.due_date}
            onChange={(event) => setTaskForm({ ...taskForm, due_date: event.target.value })}
          />
          <Select
            label="Status"
            value={taskForm.status}
            onChange={(event) =>
              setTaskForm({ ...taskForm, status: event.target.value as CaseTaskStatus })
            }
            options={CASE_TASK_STATUSES.map((status) => ({ value: status, label: status }))}
          />
          <Input
            label="Description"
            value={taskForm.description}
            onChange={(event) =>
              setTaskForm({ ...taskForm, description: event.target.value })
            }
          />
          <div className="md:col-span-2 flex justify-end">
            <Button onClick={handleCreateTask} disabled={saving}>
              <Plus className="w-4 h-4 mr-2" />
              Add Task
            </Button>
          </div>
        </div>
      </Card>
    );
  };

  const renderDetails = () => {
    if (!selectedCase) {
      return <Card className="p-6 text-sm text-slate-500">Select a case to view details.</Card>;
    }

    return (
      <div className="space-y-6">
        <Card className="p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-sm text-slate-500">Case Details</p>
              <h3 className="text-2xl font-semibold text-slate-900">
                {selectedCase.case_number}
              </h3>
              <div className="flex flex-wrap gap-2 mt-3">
                <Badge variant={statusBadgeVariant(selectedCase.status)}>
                  {selectedCase.status}
                </Badge>
                <Badge variant={isOverdue(selectedCase) ? 'danger' : 'default'}>
                  {getDaysText(selectedCase.target_release_date)}
                </Badge>
                {canViewPayment && (
                  <Badge variant={selectedCase.payment_status === 'Paid' ? 'success' : 'warning'}>
                    Payment: {selectedCase.payment_status || '-'}
                  </Badge>
                )}
              </div>
            </div>
            <Button variant="outline" onClick={() => setActiveView('all')}>
              Back to Cases
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mt-6 text-sm">
            <div>
              <p className="text-slate-500">Client</p>
              <p className="font-medium text-slate-900">{selectedCase.client_name || '-'}</p>
              <p className="text-slate-500">
                {selectedCase.client?.client_code || ''}{' '}
                {selectedCase.client?.contact_number || ''}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Service</p>
              <p className="font-medium text-slate-900">{selectedCase.service_name || '-'}</p>
            </div>
            <div>
              <p className="text-slate-500">Transaction Reference</p>
              <p className="font-medium text-slate-900">
                {selectedCase.transaction_number || selectedCase.transaction_id || '-'}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Assigned Associate</p>
              <p className="font-medium text-slate-900">
                {selectedCase.associate_name || 'Unassigned'}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Target Release Date</p>
              <p className="font-medium text-slate-900">
                {formatDate(selectedCase.target_release_date)}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Report Status</p>
              <p className="font-medium text-slate-900">
                {selectedCase.report_status || selectedCase.status}
              </p>
            </div>
          </div>
        </Card>

        {(canManageCases || canAddProgress) && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {canManageCases && (
              <Card className="p-5">
                <h3 className="font-semibold text-slate-900 mb-4">Case Controls</h3>
                <div className="space-y-4">
                  <Select
                    label="Current Status"
                    value={newStatus}
                    onChange={(event) => setNewStatus(event.target.value as CaseStatus)}
                    options={CASE_STATUSES.map((status) => ({ value: status, label: status }))}
                  />
                  <Input
                    label="Progress Remark"
                    value={statusNote}
                    onChange={(event) => setStatusNote(event.target.value)}
                  />
                  <Button onClick={handleUpdateStatus} disabled={saving}>
                    Update Status
                  </Button>

                  <Select
                    label="Assigned Associate"
                    value={newAssociateId}
                    onChange={(event) => setNewAssociateId(event.target.value)}
                    options={[
                      { value: '', label: 'Unassigned' },
                      ...formOptions.associates.map((associate) => ({
                        value: associate.id,
                        label: associate.full_name
                      }))
                    ]}
                  />
                  <Button variant="outline" onClick={handleAssignAssociate} disabled={saving}>
                    Assign Associate
                  </Button>
                </div>
              </Card>
            )}

            {canAddProgress && (
              <Card className="p-5">
                <h3 className="font-semibold text-slate-900 mb-4">Progress Remark</h3>
                <textarea
                  value={progressNote}
                  onChange={(event) => setProgressNote(event.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
                <div className="flex justify-end mt-3">
                  <Button onClick={handleAddProgressNote} disabled={saving || !progressNote.trim()}>
                    Add Remark
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <Card className="p-5">
            <h3 className="font-semibold text-slate-900 mb-4">Progress Timeline</h3>
            <div className="space-y-4">
              {progressLogs.map((log) => (
                <div key={log.id} className="border-l-2 border-teal-200 pl-4">
                  <p className="text-sm font-medium text-slate-900">
                    {log.from_status || 'Created'} → {log.to_status}
                  </p>
                  <p className="text-sm text-slate-600 mt-1">{log.notes || '-'}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {new Date(log.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
              {progressLogs.length === 0 && (
                <p className="text-sm text-slate-500">No progress entries found.</p>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-semibold text-slate-900 mb-4">Internal Remarks</h3>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">
              {selectedCase.internal_notes || '-'}
            </p>
          </Card>
        </div>

        {renderTasks(caseTasks, 'Tasks')}
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">
            Case Management
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Operational case tracking for assessment workflows.
          </p>
        </div>
        <Button variant="outline" onClick={loadData} disabled={loading}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {renderViewButton('dashboard', 'Case Dashboard', FolderKanban)}
        {renderViewButton('all', 'All Cases', ClipboardList, cases.length)}
        {renderViewButton('mine', 'My Cases', Eye, filteredCases.length)}
        {canManageCases && renderViewButton('create', 'Create Case', Plus)}
        {renderViewButton('tasks', 'Case Tasks', ListChecks, tasks.filter(isOpenTask).length)}
        {renderViewButton('overdue', 'Overdue Cases', AlertTriangle, overdueCases.length)}
        {renderViewButton('review', 'For Review', Clock, reviewCases.length)}
        {renderViewButton('release', 'Ready for Release', FileCheck2, releaseCases.length)}
      </div>

      {error && (
        <Card className="p-4 border border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </Card>
      )}

      {loading ? (
        <Card className="p-8 text-center text-slate-500">Loading cases...</Card>
      ) : (
        <>
          {activeView === 'dashboard' && renderDashboard()}
          {activeView === 'all' && renderCaseTable(filteredCases, 'All Cases')}
          {activeView === 'mine' && renderCaseTable(filteredCases, 'My Cases')}
          {activeView === 'create' && renderCreateCase()}
          {activeView === 'details' && renderDetails()}
          {activeView === 'tasks' && (
            <div className="space-y-4">
              {renderTaskCreate()}
              {renderTasks(visibleTasks)}
            </div>
          )}
          {activeView === 'overdue' && renderCaseTable(overdueCases, 'Overdue Cases')}
          {activeView === 'review' && renderCaseTable(reviewCases, 'For Review')}
          {activeView === 'release' && renderCaseTable(releaseCases, 'Ready for Release')}
        </>
      )}
    </div>
  );
};
