import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock,
  Eye,
  FileCheck2,
  Flag,
  FolderKanban,
  GripVertical,
  ListChecks,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  UserRound
} from 'lucide-react';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Modal } from '../components/Modal';
import { Select } from '../components/Select';
import {
  CASE_STATUSES,
  CASE_TASK_STATUSES,
  CaseRecord,
  CaseStatus,
  CaseTask,
  CaseTaskStatus,
  CaseFormOptions,
  CaseWorkflow,
  CaseWorkflowColumn,
  CaseWorkflowGroup,
  caseManagementService
} from '../services/caseManagement.service';
import type { AppUser } from '../services/userService';

interface CaseManagementProps {
  currentUser: AppUser | null;
  workspaceView?: CaseView;
  onWorkspaceViewChange?: (view: CaseView) => void;
  showViewNavigation?: boolean;
}

export type CaseView =
  | 'board'
  | 'dashboard'
  | 'all'
  | 'mine'
  | 'create'
  | 'details'
  | 'tasks'
  | 'overdue'
  | 'review'
  | 'release';

const REPORT_STATUSES = [
  'Not Started',
  'In Progress',
  'For Review',
  'For Revision',
  'Ready for Release',
  'Released',
  'Cancelled'
] as const;

const PAYMENT_STATUSES = ['Paid', 'Partial', 'Unpaid', 'Overpaid', 'Void'] as const;

const EMPTY_TASK_FORM = {
  case_id: '',
  title: '',
  description: '',
  assigned_to_associate_id: '',
  due_date: '',
  status: 'Pending' as CaseTaskStatus
};

const CASE_STATUS_ACCENTS: Record<string, string> = {
  New: 'bg-sky-500',
  Scheduled: 'bg-indigo-500',
  'Testing Ongoing': 'bg-violet-500',
  'Testing Completed': 'bg-purple-500',
  Scoring: 'bg-fuchsia-500',
  Interpretation: 'bg-cyan-500',
  'Report Writing': 'bg-blue-500',
  'For Review': 'bg-amber-500',
  'For Revision': 'bg-orange-500',
  'Ready for Release': 'bg-emerald-500',
  Released: 'bg-teal-500',
  Closed: 'bg-slate-500',
  Cancelled: 'bg-rose-500'
};

const CASE_PRIORITY_STYLES: Record<CaseRecord['priority'], string> = {
  Low: 'bg-slate-100 text-slate-600',
  Normal: 'bg-sky-50 text-sky-700',
  High: 'bg-orange-50 text-orange-700',
  Urgent: 'bg-rose-50 text-rose-700'
};

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

const caseMatchesWorkflowState = (caseItem: CaseRecord, status: string) =>
  caseItem.status === status || caseItem.report_status === status;

const getCaseBranch = (caseItem: CaseRecord) => {
  const extendedCase = caseItem as CaseRecord & {
    branch?: string | null;
    branch_id?: string | null;
    branch_name?: string | null;
    client?: CaseRecord['client'] & {
      branch?: string | null;
      branch_id?: string | null;
      branch_name?: string | null;
    };
  };

  return (
    extendedCase.branch_name ||
    extendedCase.branch ||
    extendedCase.branch_id ||
    extendedCase.client?.branch_name ||
    extendedCase.client?.branch ||
    extendedCase.client?.branch_id ||
    ''
  );
};

const getCaseDate = (caseItem: CaseRecord) =>
  (caseItem.created_at || caseItem.target_release_date || '').slice(0, 10);

const isReleasedThisMonth = (caseItem: CaseRecord) => {
  if (!caseMatchesWorkflowState(caseItem, 'Released')) return false;

  const dateValue = caseItem.released_at || caseItem.updated_at;
  if (!dateValue) return false;

  const releasedAt = new Date(dateValue);
  const today = new Date();

  return (
    releasedAt.getFullYear() === today.getFullYear() &&
    releasedAt.getMonth() === today.getMonth()
  );
};

export const CaseManagement: React.FC<CaseManagementProps> = ({
  currentUser,
  workspaceView,
  onWorkspaceViewChange,
  showViewNavigation = true
}) => {
  const [internalActiveView, setInternalActiveView] =
    useState<CaseView>('board');
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [tasks, setTasks] = useState<CaseTask[]>([]);
  const [selectedCase, setSelectedCase] = useState<CaseRecord | null>(null);
  const [progressLogs, setProgressLogs] = useState<any[]>([]);
  const [formOptions, setFormOptions] = useState<CaseFormOptions>({
    clients: [],
    services: [],
    associates: []
  });
  const [workflow, setWorkflow] = useState<CaseWorkflow>({
    groups: [],
    columns: CASE_STATUSES.map((status, index) => ({
      id: status,
      group_id: null,
      status_key: status,
      name: status,
      color: '#0f9d91',
      sort_order: index * 10,
      is_terminal: ['Released', 'Closed', 'Cancelled'].includes(status),
      is_active: true
    }))
  });
  const [showWorkflowEditor, setShowWorkflowEditor] = useState(false);
  const [isTaskDialogOpen, setIsTaskDialogOpen] = useState(false);
  const [taskDialogError, setTaskDialogError] = useState('');
  const [workflowGroupForm, setWorkflowGroupForm] = useState({
    name: '',
    color: '#0f9d91'
  });
  const [workflowColumnForm, setWorkflowColumnForm] = useState({
    group_id: '',
    name: '',
    color: '#0f9d91',
    is_terminal: false
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [movingCaseId, setMovingCaseId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<CaseStatus | null>(null);
  const [draggedWorkflowGroupId, setDraggedWorkflowGroupId] = useState<string | null>(null);
  const [draggedWorkflowColumnId, setDraggedWorkflowColumnId] = useState<string | null>(null);
  const [dragOverWorkflowGroupId, setDragOverWorkflowGroupId] = useState<string | null>(null);
  const [dragOverWorkflowColumnId, setDragOverWorkflowColumnId] = useState<string | null>(null);
  const [collapsedWorkflowGroupIds, setCollapsedWorkflowGroupIds] = useState<Set<string>>(
    new Set()
  );
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
  const [taskForm, setTaskForm] = useState({ ...EMPTY_TASK_FORM });
  const [dashboardFilters, setDashboardFilters] = useState({
    date_from: '',
    date_to: '',
    branch: '',
    associate_id: '',
    service_id: '',
    case_status: '',
    report_status: '',
    payment_status: ''
  });

  const role = currentUser?.role;
  const activeView = workspaceView || internalActiveView;
  const setActiveView = (view: CaseView) => {
    setInternalActiveView(view);
    onWorkspaceViewChange?.(view);
  };
  const canViewPayment = ['admin', 'manager', 'case_staff'].includes(role || '');
  const canManageCases = ['admin', 'manager', 'case_staff'].includes(role || '');
  const canConfigureWorkflow = ['admin', 'manager'].includes(role || '');
  const canEditTasks = ['admin', 'manager', 'case_staff', 'associate_user'].includes(role || '');
  const canAddProgress = ['admin', 'manager', 'case_staff', 'associate_user'].includes(role || '');

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');

      const [caseRows, taskRows, workflowData] = await Promise.all([
        caseManagementService.listCases(),
        caseManagementService.listTasks(),
        caseManagementService.getWorkflow()
      ]);

      setCases(caseRows);
      setTasks(taskRows);
      setWorkflow(workflowData);

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

  const branchOptions = useMemo(() => {
    const branches = Array.from(
      new Set(cases.map(getCaseBranch).filter(Boolean))
    ).sort();

    return branches.map((branch) => ({ value: branch, label: branch }));
  }, [cases]);

  const associateOptions = useMemo(() => {
    const fromOptions = formOptions.associates.map((associate) => ({
      value: associate.id,
      label: associate.full_name
    }));
    const fromCases = cases
      .filter((caseItem) => caseItem.associate_id)
      .map((caseItem) => ({
        value: caseItem.associate_id as string,
        label: caseItem.associate_name || 'Assigned associate'
      }));

    return Array.from(new Map([...fromOptions, ...fromCases].map((item) => [item.value, item])).values())
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [cases, formOptions.associates]);

  const serviceOptions = useMemo(() => {
    const fromOptions = formOptions.services.map((service) => ({
      value: service.id,
      label: service.name
    }));
    const fromCases = cases
      .filter((caseItem) => caseItem.service_id)
      .map((caseItem) => ({
        value: caseItem.service_id as string,
        label: caseItem.service_name || 'Service'
      }));

    return Array.from(new Map([...fromOptions, ...fromCases].map((item) => [item.value, item])).values())
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [cases, formOptions.services]);

  const filteredCases = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();

    return cases.filter((caseItem) =>
      (!normalized ||
        [
          caseItem.case_number,
          caseItem.client_name,
          caseItem.service_name,
          caseItem.associate_name,
          caseItem.status,
          caseItem.report_status
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalized))) &&
      (!dashboardFilters.date_from || getCaseDate(caseItem) >= dashboardFilters.date_from) &&
      (!dashboardFilters.date_to || getCaseDate(caseItem) <= dashboardFilters.date_to) &&
      (!dashboardFilters.branch || getCaseBranch(caseItem) === dashboardFilters.branch) &&
      (!dashboardFilters.associate_id || caseItem.associate_id === dashboardFilters.associate_id) &&
      (!dashboardFilters.service_id || caseItem.service_id === dashboardFilters.service_id) &&
      (!dashboardFilters.case_status || caseItem.status === dashboardFilters.case_status) &&
      (!dashboardFilters.report_status ||
        (caseItem.report_status || 'Not Started') === dashboardFilters.report_status) &&
      (!dashboardFilters.payment_status ||
        (canViewPayment && caseItem.payment_status === dashboardFilters.payment_status))
    );
  }, [canViewPayment, cases, dashboardFilters, searchTerm]);

  const overdueCases = useMemo(() => filteredCases.filter(isOverdue), [filteredCases]);
  const reviewCases = useMemo(
    () => filteredCases.filter((caseItem) => caseMatchesWorkflowState(caseItem, 'For Review')),
    [filteredCases]
  );
  const releaseCases = useMemo(
    () => filteredCases.filter((caseItem) => caseMatchesWorkflowState(caseItem, 'Ready for Release')),
    [filteredCases]
  );
  const dashboardSummary = useMemo(
    () => [
      {
        label: 'New cases',
        value: filteredCases.filter((caseItem) => caseItem.status === 'New').length,
        icon: FolderKanban
      },
      {
        label: 'Testing ongoing',
        value: filteredCases.filter((caseItem) => caseItem.status === 'Testing Ongoing').length,
        icon: Clock
      },
      {
        label: 'Report writing',
        value: filteredCases.filter((caseItem) => caseMatchesWorkflowState(caseItem, 'Report Writing')).length,
        icon: ClipboardList
      },
      {
        label: 'For review',
        value: reviewCases.length,
        icon: FileCheck2
      },
      {
        label: 'For revision',
        value: filteredCases.filter((caseItem) => caseMatchesWorkflowState(caseItem, 'For Revision')).length,
        icon: RefreshCw
      },
      {
        label: 'Ready for release',
        value: releaseCases.length,
        icon: CheckCircle2
      },
      {
        label: 'Released this month',
        value: filteredCases.filter(isReleasedThisMonth).length,
        icon: CalendarDays
      },
      {
        label: 'Overdue cases',
        value: overdueCases.length,
        icon: AlertTriangle
      }
    ],
    [filteredCases, overdueCases.length, releaseCases.length, reviewCases.length]
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
    setSelectedCase((current) => current?.id === updated.id ? updated : current);
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

  const openSelectedCaseTaskDialog = () => {
    if (!selectedCase || !canManageCases) return;

    setTaskForm({
      ...EMPTY_TASK_FORM,
      case_id: selectedCase.id,
      assigned_to_associate_id: selectedCase.associate_id || ''
    });
    setTaskDialogError('');
    setIsTaskDialogOpen(true);
  };

  const closeSelectedCaseTaskDialog = () => {
    if (saving) return;
    setIsTaskDialogOpen(false);
    setTaskDialogError('');
    setTaskForm({ ...EMPTY_TASK_FORM });
  };

  const handleCreateTask = async (fromDialog = false) => {
    if (!taskForm.case_id || !taskForm.title.trim()) {
      const message = 'Please select a case and enter a task title.';
      if (fromDialog) {
        setTaskDialogError(message);
      } else {
        setError(message);
      }
      return;
    }

    try {
      setSaving(true);
      setTaskDialogError('');
      setError('');
      const created = await caseManagementService.createTask({
        case_id: taskForm.case_id,
        title: taskForm.title.trim(),
        description: taskForm.description || null,
        assigned_to_associate_id: taskForm.assigned_to_associate_id || null,
        due_date: taskForm.due_date || null,
        status: taskForm.status
      });
      setTasks((current) => [created, ...current]);
      setTaskForm({ ...EMPTY_TASK_FORM });
      if (fromDialog) {
        setIsTaskDialogOpen(false);
      }
    } catch (err: any) {
      const message = err.message || 'Unable to create task.';
      if (fromDialog) {
        setTaskDialogError(message);
      } else {
        setError(message);
      }
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

  const handleBoardStatusChange = async (
    caseItem: CaseRecord,
    status: CaseStatus
  ) => {
    if (!canManageCases || caseItem.status === status) return;

    if (
      workflow.columns.find((column) => column.status_key === status)?.is_terminal
      && !window.confirm(
        `Move ${caseItem.case_number} from ${caseItem.status} to ${status}?`
      )
    ) {
      return;
    }

    try {
      setMovingCaseId(caseItem.id);
      setError('');
      const updated = await caseManagementService.updateCaseStatus(
        caseItem.id,
        status,
        `Moved on Kanban board from ${caseItem.status} to ${status}`
      );
      refreshSelectedCase(updated);
    } catch (err: any) {
      setError(err.message || 'Unable to move the case.');
    } finally {
      setMovingCaseId(null);
      setDragOverStatus(null);
    }
  };

  const handleCaseDrop = async (
    event: React.DragEvent<HTMLDivElement>,
    status: CaseStatus
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const caseId = event.dataTransfer.getData('application/x-psyzygy-case');
    const caseItem = cases.find((item) => item.id === caseId);

    if (caseItem) {
      await handleBoardStatusChange(caseItem, status);
    } else {
      setDragOverStatus(null);
    }
  };

  const statusOptions = workflow.columns.map((column) => ({
    value: column.status_key,
    label: column.name
  }));

  const handleCreateWorkflowGroup = async () => {
    if (!workflowGroupForm.name.trim()) return;
    try {
      setSaving(true);
      setError('');
      await caseManagementService.createWorkflowGroup({
        name: workflowGroupForm.name.trim(),
        color: workflowGroupForm.color
      });
      setWorkflow(await caseManagementService.getWorkflow());
      setWorkflowGroupForm({ name: '', color: '#0f9d91' });
    } catch (err: any) {
      setError(err.message || 'Unable to create workflow group.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateWorkflowColumn = async () => {
    if (!workflowColumnForm.name.trim()) return;
    try {
      setSaving(true);
      setError('');
      await caseManagementService.createWorkflowColumn({
        group_id: workflowColumnForm.group_id || null,
        name: workflowColumnForm.name.trim(),
        color: workflowColumnForm.color,
        is_terminal: workflowColumnForm.is_terminal
      });
      setWorkflow(await caseManagementService.getWorkflow());
      setWorkflowColumnForm({
        group_id: '',
        name: '',
        color: '#0f9d91',
        is_terminal: false
      });
    } catch (err: any) {
      setError(err.message || 'Unable to create workflow column.');
    } finally {
      setSaving(false);
    }
  };

  const orderedWorkflowGroups = [...workflow.groups].sort(
    (left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name)
  );

  const getWorkflowColumnsForGroup = (groupId: string | null) =>
    workflow.columns
      .filter((column) => column.group_id === groupId)
      .sort(
        (left, right) =>
          left.sort_order - right.sort_order || left.name.localeCompare(right.name)
      );

  const boardWorkflowGroups: Array<
    CaseWorkflowGroup & { is_ungrouped?: boolean }
  > = [
    ...orderedWorkflowGroups,
    ...(getWorkflowColumnsForGroup(null).length > 0
      ? [{
          id: '__ungrouped__',
          name: 'Ungrouped',
          color: '#94a3b8',
          sort_order: Number.MAX_SAFE_INTEGER,
          is_active: true,
          is_ungrouped: true
        }]
      : [])
  ];
  const collapsedVisibleWorkflowGroupCount = boardWorkflowGroups.filter((group) =>
    collapsedWorkflowGroupIds.has(group.id)
  ).length;

  const toggleWorkflowGroup = (groupId: string) => {
    setCollapsedWorkflowGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const collapseAllWorkflowGroups = () => {
    setCollapsedWorkflowGroupIds(
      new Set(boardWorkflowGroups.map((group) => group.id))
    );
  };

  const showAllWorkflowGroups = () => {
    setCollapsedWorkflowGroupIds(new Set());
  };

  const persistWorkflowLayout = async (
    groups: CaseWorkflowGroup[],
    columns: CaseWorkflowColumn[]
  ) => {
    const previousWorkflow = workflow;
    const normalizedGroups = groups.map((group, index) => ({
      ...group,
      sort_order: (index + 1) * 10
    }));
    const groupIds: Array<string | null> = [
      ...normalizedGroups.map((group) => group.id),
      null
    ];
    const normalizedColumns = groupIds.flatMap((groupId) =>
      columns
        .filter((column) => column.group_id === groupId)
        .map((column, index) => ({
          ...column,
          sort_order: (index + 1) * 10
        }))
    );
    const nextWorkflow = {
      groups: normalizedGroups,
      columns: normalizedColumns
    };

    setWorkflow(nextWorkflow);
    setSaving(true);
    setError('');

    try {
      const savedWorkflow = await caseManagementService.reorderWorkflow({
        groups: normalizedGroups.map(({ id, sort_order }) => ({ id, sort_order })),
        columns: normalizedColumns.map(({ id, group_id, sort_order }) => ({
          id,
          group_id,
          sort_order
        }))
      });
      setWorkflow(savedWorkflow);
    } catch (err: any) {
      setWorkflow(previousWorkflow);
      setError(err.message || 'Unable to save the workflow order.');
    } finally {
      setSaving(false);
      setDraggedWorkflowGroupId(null);
      setDraggedWorkflowColumnId(null);
      setDragOverWorkflowGroupId(null);
      setDragOverWorkflowColumnId(null);
    }
  };

  const moveWorkflowGroup = async (
    sourceId: string,
    targetId: string,
    insertAfter: boolean
  ) => {
    if (!canConfigureWorkflow || sourceId === targetId) return;

    const groups = [...orderedWorkflowGroups];
    const sourceIndex = groups.findIndex((group) => group.id === sourceId);
    if (sourceIndex < 0 || !groups.some((group) => group.id === targetId)) return;

    const [movedGroup] = groups.splice(sourceIndex, 1);
    const targetIndex = groups.findIndex((group) => group.id === targetId);
    groups.splice(targetIndex + (insertAfter ? 1 : 0), 0, movedGroup);
    await persistWorkflowLayout(
      groups,
      groups.flatMap((group) => getWorkflowColumnsForGroup(group.id)).concat(
        getWorkflowColumnsForGroup(null)
      )
    );
  };

  const moveWorkflowColumn = async (
    sourceId: string,
    targetGroupId: string | null,
    targetColumnId?: string,
    insertAfter = false
  ) => {
    if (!canConfigureWorkflow) return;
    if (sourceId === targetColumnId) return;

    const sourceColumn = workflow.columns.find((column) => column.id === sourceId);
    if (!sourceColumn) return;

    const columnGroups = new Map<string | null, CaseWorkflowColumn[]>();
    [...orderedWorkflowGroups.map((group) => group.id), null].forEach((groupId) => {
      columnGroups.set(
        groupId,
        getWorkflowColumnsForGroup(groupId).filter((column) => column.id !== sourceId)
      );
    });

    const targetColumns = columnGroups.get(targetGroupId) || [];
    const targetIndex = targetColumnId
      ? targetColumns.findIndex((column) => column.id === targetColumnId)
      : targetColumns.length;
    targetColumns.splice(
      targetIndex < 0
        ? targetColumns.length
        : targetIndex + (targetColumnId && insertAfter ? 1 : 0),
      0,
      { ...sourceColumn, group_id: targetGroupId }
    );
    columnGroups.set(targetGroupId, targetColumns);

    await persistWorkflowLayout(
      orderedWorkflowGroups,
      [...orderedWorkflowGroups.map((group) => group.id), null].flatMap(
        (groupId) => columnGroups.get(groupId) || []
      )
    );
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

  const renderDashboardFilters = () => (
    <Card className="p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Input
          label="Date From"
          type="date"
          value={dashboardFilters.date_from}
          onChange={(event) =>
            setDashboardFilters({ ...dashboardFilters, date_from: event.target.value })
          }
        />
        <Input
          label="Date To"
          type="date"
          value={dashboardFilters.date_to}
          onChange={(event) =>
            setDashboardFilters({ ...dashboardFilters, date_to: event.target.value })
          }
        />
        <Select
          label="Branch"
          value={dashboardFilters.branch}
          disabled={branchOptions.length === 0}
          onChange={(event) =>
            setDashboardFilters({ ...dashboardFilters, branch: event.target.value })
          }
          options={[
            {
              value: '',
              label: branchOptions.length === 0 ? 'No branch data' : 'All branches'
            },
            ...branchOptions
          ]}
        />
        <Select
          label="Associate"
          value={dashboardFilters.associate_id}
          onChange={(event) =>
            setDashboardFilters({ ...dashboardFilters, associate_id: event.target.value })
          }
          options={[{ value: '', label: 'All associates' }, ...associateOptions]}
        />
        <Select
          label="Service"
          value={dashboardFilters.service_id}
          onChange={(event) =>
            setDashboardFilters({ ...dashboardFilters, service_id: event.target.value })
          }
          options={[{ value: '', label: 'All services' }, ...serviceOptions]}
        />
        <Select
          label="Case Status"
          value={dashboardFilters.case_status}
          onChange={(event) =>
            setDashboardFilters({ ...dashboardFilters, case_status: event.target.value })
          }
          options={[
            { value: '', label: 'All case statuses' },
            ...statusOptions
          ]}
        />
        <Select
          label="Report Status"
          value={dashboardFilters.report_status}
          onChange={(event) =>
            setDashboardFilters({ ...dashboardFilters, report_status: event.target.value })
          }
          options={[
            { value: '', label: 'All report statuses' },
            ...REPORT_STATUSES.map((status) => ({ value: status, label: status }))
          ]}
        />
        {canViewPayment && (
          <Select
            label="Payment Status"
            value={dashboardFilters.payment_status}
            onChange={(event) =>
              setDashboardFilters({ ...dashboardFilters, payment_status: event.target.value })
            }
            options={[
              { value: '', label: 'All payment statuses' },
              ...PAYMENT_STATUSES.map((status) => ({ value: status, label: status }))
            ]}
          />
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          variant="outline"
          onClick={() =>
            setDashboardFilters({
              date_from: '',
              date_to: '',
              branch: '',
              associate_id: '',
              service_id: '',
              case_status: '',
              report_status: '',
              payment_status: ''
            })
          }
        >
          Clear Filters
        </Button>
      </div>
    </Card>
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

  const renderKanbanBoard = () => (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="font-semibold text-slate-900">Case Workflow Board</h3>
            <p className="mt-1 text-sm text-slate-500">
              {canManageCases
                ? canConfigureWorkflow
                  ? 'Drag group and column headers to arrange the board. Drag case cards between columns to update status.'
                  : 'Drag cards between columns to update status. Every move is recorded in the case timeline.'
                : 'Your access is read-only. Open a card to review its case details.'}
            </p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
            <div className="relative min-w-[260px] flex-1 lg:w-80 lg:flex-none">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search case, client, service, or associate"
                className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={collapseAllWorkflowGroups}
              disabled={
                boardWorkflowGroups.length === 0
                || collapsedVisibleWorkflowGroupCount === boardWorkflowGroups.length
              }
            >
              <ChevronRight className="mr-1.5 h-4 w-4" />
              Collapse All Groups
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={showAllWorkflowGroups}
              disabled={collapsedVisibleWorkflowGroupCount === 0}
            >
              <ChevronDown className="mr-1.5 h-4 w-4" />
              Show All Groups
            </Button>
            {canConfigureWorkflow && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowWorkflowEditor((visible) => !visible)}
              >
                <Settings2 className="mr-2 h-4 w-4" />
                Configure Board
              </Button>
            )}
          </div>
        </div>
      </Card>

      {canConfigureWorkflow && showWorkflowEditor && (
        <Card className="p-5">
          <h3 className="font-semibold text-slate-900">Workflow Configuration</h3>
          <p className="mt-1 text-sm text-slate-500">
            Add a group, then add columns inside it. Existing card history is preserved.
          </p>
          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <div className="space-y-3">
              <Input
                label="New Group Name"
                value={workflowGroupForm.name}
                onChange={(event) =>
                  setWorkflowGroupForm({ ...workflowGroupForm, name: event.target.value })
                }
              />
              <input
                type="color"
                value={workflowGroupForm.color}
                onChange={(event) =>
                  setWorkflowGroupForm({ ...workflowGroupForm, color: event.target.value })
                }
                className="h-10 w-16 rounded border border-slate-300"
                aria-label="Group color"
              />
              <Button onClick={handleCreateWorkflowGroup} disabled={saving}>
                Add Group
              </Button>
            </div>
            <div className="space-y-3">
              <Select
                label="Group"
                value={workflowColumnForm.group_id}
                onChange={(event) =>
                  setWorkflowColumnForm({ ...workflowColumnForm, group_id: event.target.value })
                }
                options={[
                  { value: '', label: 'No group' },
                  ...workflow.groups.map((group) => ({ value: group.id, label: group.name }))
                ]}
              />
              <Input
                label="New Column Name"
                value={workflowColumnForm.name}
                onChange={(event) =>
                  setWorkflowColumnForm({ ...workflowColumnForm, name: event.target.value })
                }
              />
              <div className="flex items-center gap-4">
                <input
                  type="color"
                  value={workflowColumnForm.color}
                  onChange={(event) =>
                    setWorkflowColumnForm({ ...workflowColumnForm, color: event.target.value })
                  }
                  className="h-10 w-16 rounded border border-slate-300"
                  aria-label="Column color"
                />
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={workflowColumnForm.is_terminal}
                    onChange={(event) =>
                      setWorkflowColumnForm({
                        ...workflowColumnForm,
                        is_terminal: event.target.checked
                      })
                    }
                  />
                  Terminal status
                </label>
              </div>
              <Button onClick={handleCreateWorkflowColumn} disabled={saving}>
                Add Column
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="overflow-x-auto pb-4 [scrollbar-color:#94a3b8_transparent] [scrollbar-width:thin]">
        <div className="flex min-h-[600px] w-max items-start gap-4">
          {boardWorkflowGroups.map((group) => {
            const groupId = group.is_ungrouped ? null : group.id;
            const groupColumns = getWorkflowColumnsForGroup(groupId);
            const isGroupDropTarget = dragOverWorkflowGroupId === group.id;
            const isCollapsed = collapsedWorkflowGroupIds.has(group.id);
            const groupCaseCount = groupColumns.reduce(
              (total, column) =>
                total
                + filteredCases.filter(
                  (caseItem) => caseItem.status === column.status_key
                ).length,
              0
            );

            return (
              <section
                key={group.id}
                className={`shrink-0 rounded-3xl border bg-white/70 p-3 shadow-sm transition-all ${
                  isCollapsed ? 'w-[230px]' : ''
                } ${
                  isGroupDropTarget
                    ? 'border-teal-400 ring-2 ring-teal-100'
                    : 'border-slate-200'
                }`}
                style={{ borderTopColor: group.color, borderTopWidth: 4 }}
                onDragOver={(event) => {
                  if (!canConfigureWorkflow) return;
                  if (!draggedWorkflowGroupId && !draggedWorkflowColumnId) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setDragOverWorkflowGroupId(group.id);
                }}
                onDrop={(event) => {
                  if (!canConfigureWorkflow) return;
                  event.preventDefault();
                  event.stopPropagation();
                  if (draggedWorkflowColumnId) {
                    void moveWorkflowColumn(draggedWorkflowColumnId, groupId);
                  } else if (draggedWorkflowGroupId && !group.is_ungrouped) {
                    const bounds = event.currentTarget.getBoundingClientRect();
                    void moveWorkflowGroup(
                      draggedWorkflowGroupId,
                      group.id,
                      event.clientX > bounds.left + bounds.width / 2
                    );
                  }
                }}
              >
                <header
                  draggable={canConfigureWorkflow && !group.is_ungrouped && !saving}
                  onDragStart={(event) => {
                    if (group.is_ungrouped) return;
                    event.stopPropagation();
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData(
                      'application/x-psyzygy-workflow-group',
                      group.id
                    );
                    setDraggedWorkflowGroupId(group.id);
                  }}
                  onDragEnd={() => {
                    setDraggedWorkflowGroupId(null);
                    setDragOverWorkflowGroupId(null);
                  }}
                  className={`${isCollapsed ? '' : 'mb-3'} flex items-center justify-between rounded-2xl px-3 py-2.5 ${
                    canConfigureWorkflow && !group.is_ungrouped
                      ? 'cursor-grab active:cursor-grabbing'
                      : ''
                  }`}
                  style={{ backgroundColor: `${group.color}14` }}
                >
                  <div className="flex items-center gap-2">
                    {canConfigureWorkflow && !group.is_ungrouped && (
                      <GripVertical className="h-4 w-4 text-slate-400" />
                    )}
                    <div>
                      <h4 className="text-sm font-bold text-slate-800">{group.name}</h4>
                      <p className="text-[11px] text-slate-500">
                        {groupColumns.length} column{groupColumns.length === 1 ? '' : 's'}
                        {' · '}
                        {groupCaseCount} case{groupCaseCount === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {saving && isGroupDropTarget && (
                      <RefreshCw className="h-4 w-4 animate-spin text-teal-600" />
                    )}
                    <button
                      type="button"
                      draggable={false}
                      onMouseDown={(event) => event.stopPropagation()}
                      onDragStart={(event) => event.preventDefault()}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleWorkflowGroup(group.id);
                      }}
                      className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/80 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                      aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${group.name}`}
                      aria-expanded={!isCollapsed}
                      title={`${isCollapsed ? 'Expand' : 'Collapse'} group`}
                    >
                      {isCollapsed
                        ? <ChevronRight className="h-4 w-4" />
                        : <ChevronDown className="h-4 w-4" />}
                    </button>
                  </div>
                </header>

                {!isCollapsed && (
                <div className="flex min-h-[520px] items-start gap-3">
          {groupColumns.map((column) => {
            const status = column.status_key;
            const statusCases = filteredCases.filter(
              (caseItem) => caseItem.status === status
            );
            const isDropTarget = dragOverStatus === status;
            const isColumnDropTarget = dragOverWorkflowColumnId === column.id;

            return (
              <div
                key={status}
                className={`w-[294px] shrink-0 rounded-2xl border p-3 transition-colors ${
                  isColumnDropTarget
                    ? 'border-violet-400 bg-violet-50/80 ring-2 ring-violet-100'
                    : isDropTarget
                    ? 'border-teal-400 bg-teal-50/80'
                    : 'border-slate-200 bg-slate-100/70'
                }`}
                onDragOver={(event) => {
                  if (draggedWorkflowColumnId && canConfigureWorkflow) {
                    event.preventDefault();
                    event.stopPropagation();
                    event.dataTransfer.dropEffect = 'move';
                    setDragOverWorkflowColumnId(column.id);
                    setDragOverWorkflowGroupId(group.id);
                    return;
                  }
                  if (!canManageCases || !movingCaseId) return;
                  event.preventDefault();
                  event.stopPropagation();
                  event.dataTransfer.dropEffect = 'move';
                  setDragOverStatus(status);
                }}
                onDrop={(event) => {
                  if (draggedWorkflowColumnId && canConfigureWorkflow) {
                    event.preventDefault();
                    event.stopPropagation();
                    const bounds = event.currentTarget.getBoundingClientRect();
                    void moveWorkflowColumn(
                      draggedWorkflowColumnId,
                      groupId,
                      column.id,
                      event.clientX > bounds.left + bounds.width / 2
                    );
                    return;
                  }
                  void handleCaseDrop(event, status);
                }}
              >
                <div
                  draggable={canConfigureWorkflow && !saving}
                  onDragStart={(event) => {
                    event.stopPropagation();
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData(
                      'application/x-psyzygy-workflow-column',
                      column.id
                    );
                    setDraggedWorkflowColumnId(column.id);
                  }}
                  onDragEnd={() => {
                    setDraggedWorkflowColumnId(null);
                    setDragOverWorkflowColumnId(null);
                    setDragOverWorkflowGroupId(null);
                  }}
                  className={`mb-3 flex items-center justify-between px-1 ${
                    canConfigureWorkflow ? 'cursor-grab active:cursor-grabbing' : ''
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {canConfigureWorkflow && (
                      <GripVertical className="h-4 w-4 shrink-0 text-slate-400" />
                    )}
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${CASE_STATUS_ACCENTS[status] || ''}`}
                      style={CASE_STATUS_ACCENTS[status] ? undefined : { backgroundColor: column.color }}
                    />
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-semibold text-slate-800">
                        {column.name}
                      </h4>
                    </div>
                  </div>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-slate-500 shadow-sm">
                    {statusCases.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {statusCases.map((caseItem) => {
                    const openTaskCount = tasks.filter(
                      (task) => task.case_id === caseItem.id && isOpenTask(task)
                    ).length;
                    const isMoving = movingCaseId === caseItem.id;

                    return (
                      <article
                        key={caseItem.id}
                        draggable={canManageCases && !isMoving}
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData(
                            'application/x-psyzygy-case',
                            caseItem.id
                          );
                          event.dataTransfer.setData('text/plain', caseItem.id);
                          setMovingCaseId(caseItem.id);
                        }}
                        onDragEnd={() => {
                          setMovingCaseId(null);
                          setDragOverStatus(null);
                        }}
                        onClick={() => loadCaseDetails(caseItem)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            loadCaseDetails(caseItem);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        className={`group rounded-xl border bg-white p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                          canManageCases ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                        } ${isMoving ? 'opacity-50' : 'opacity-100'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
                              {caseItem.case_number}
                            </p>
                            <h5 className="mt-1 truncate font-semibold text-slate-900">
                              {caseItem.client_name || 'Client'}
                            </h5>
                          </div>
                          {canManageCases && (
                            <GripVertical className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-slate-500" />
                          )}
                        </div>

                        <p className="mt-2 line-clamp-2 text-sm text-slate-600">
                          {caseItem.service_name
                            || caseItem.presenting_concern
                            || caseItem.case_type}
                        </p>

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium ${CASE_PRIORITY_STYLES[caseItem.priority]}`}
                          >
                            <Flag className="h-3 w-3" />
                            {caseItem.priority}
                          </span>
                          {isOverdue(caseItem) && (
                            <span className="rounded-full bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700">
                              Overdue
                            </span>
                          )}
                          {openTaskCount > 0 && (
                            <span className="rounded-full bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-700">
                              {openTaskCount} task{openTaskCount === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>

                        <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-500">
                          <p className="flex items-center gap-1.5">
                            <UserRound className="h-3.5 w-3.5" />
                            <span className="truncate">
                              {caseItem.associate_name || 'Unassigned'}
                            </span>
                          </p>
                          <p className="flex items-center gap-1.5">
                            <CalendarDays className="h-3.5 w-3.5" />
                            Target {formatDate(caseItem.target_release_date)}
                          </p>
                        </div>
                      </article>
                    );
                  })}

                  {statusCases.length === 0 && (
                    <div
                      className={`rounded-xl border border-dashed px-4 py-8 text-center text-xs ${
                        isDropTarget
                          ? 'border-teal-300 bg-white/70 text-teal-700'
                          : 'border-slate-300 text-slate-400'
                      }`}
                    >
                      {canManageCases ? 'Drop a case here' : 'No cases'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
                  {groupColumns.length === 0 && (
                    <div
                      className={`flex h-32 w-[294px] items-center justify-center rounded-2xl border border-dashed px-6 text-center text-sm ${
                        isGroupDropTarget
                          ? 'border-teal-400 bg-teal-50 text-teal-700'
                          : 'border-slate-300 bg-slate-50 text-slate-400'
                      }`}
                    >
                      {canConfigureWorkflow
                        ? 'Drop a workflow column into this group'
                        : 'No columns in this group'}
                    </div>
                  )}
                </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderDashboard = () => (
    <div className="space-y-6">
      {renderDashboardFilters()}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {dashboardSummary.map((item) => {
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

  const renderCaseListView = (rows: CaseRecord[], title: string) => (
    <div className="space-y-4">
      {renderDashboardFilters()}
      {renderCaseTable(rows, title)}
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
            options={statusOptions}
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

  const renderTasks = (
    taskRows: CaseTask[],
    title = 'Case Tasks',
    showSelectedCaseAction = false
  ) => (
    <Card>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        {showSelectedCaseAction && canManageCases && (
          <Button size="sm" onClick={openSelectedCaseTaskDialog}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add Task
          </Button>
        )}
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
            <Button onClick={() => void handleCreateTask(false)} disabled={saving}>
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
            <Button variant="outline" onClick={() => setActiveView('board')}>
              Back to Board
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
                    options={statusOptions}
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

        {renderTasks(caseTasks, 'Tasks', true)}
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-10">
      <div className={`flex flex-col gap-3 xl:flex-row xl:items-center ${
        showViewNavigation ? 'xl:justify-between' : 'xl:justify-end'
      }`}>
        {showViewNavigation && (
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">
              Case Management
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Operational case tracking for assessment workflows.
            </p>
          </div>
        )}
        <Button variant="outline" onClick={loadData} disabled={loading}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {showViewNavigation && (
        <div className="flex flex-wrap gap-2">
          {renderViewButton('board', 'Case Board', FolderKanban, cases.length)}
          {renderViewButton('dashboard', 'Case Dashboard', BarChart3)}
          {renderViewButton('all', 'All Cases', ClipboardList, cases.length)}
          {renderViewButton('mine', 'My Cases', Eye, filteredCases.length)}
          {canManageCases && renderViewButton('create', 'Create Case', Plus)}
          {renderViewButton('tasks', 'Case Tasks', ListChecks, tasks.filter(isOpenTask).length)}
          {renderViewButton('overdue', 'Overdue Cases', AlertTriangle, overdueCases.length)}
          {renderViewButton('review', 'For Review', Clock, reviewCases.length)}
          {renderViewButton('release', 'Ready for Release', FileCheck2, releaseCases.length)}
        </div>
      )}

      {error && (
        <Card className="p-4 border border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </Card>
      )}

      {loading ? (
        <Card className="p-8 text-center text-slate-500">Loading cases...</Card>
      ) : (
        <>
          {activeView === 'board' && renderKanbanBoard()}
          {activeView === 'dashboard' && renderDashboard()}
          {activeView === 'all' && renderCaseListView(filteredCases, 'All Cases')}
          {activeView === 'mine' && renderCaseListView(filteredCases, 'My Cases')}
          {activeView === 'create' && renderCreateCase()}
          {activeView === 'details' && renderDetails()}
          {activeView === 'tasks' && (
            <div className="space-y-4">
              {renderTaskCreate()}
              {renderTasks(visibleTasks)}
            </div>
          )}
          {activeView === 'overdue' && renderCaseListView(overdueCases, 'Overdue Cases')}
          {activeView === 'review' && renderCaseListView(reviewCases, 'For Review')}
          {activeView === 'release' && renderCaseListView(releaseCases, 'Ready for Release')}
        </>
      )}

      <Modal
        isOpen={isTaskDialogOpen}
        onClose={closeSelectedCaseTaskDialog}
        title={`Add Task${selectedCase ? ` · ${selectedCase.case_number}` : ''}`}
        size="md"
      >
        {selectedCase && (
          <div className="space-y-5">
            <div className="rounded-xl border border-teal-100 bg-teal-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
                Selected Case
              </p>
              <p className="mt-1 font-semibold text-slate-900">
                {selectedCase.case_number} · {selectedCase.client_name || 'Client'}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {selectedCase.service_name || selectedCase.case_type}
              </p>
            </div>

            {taskDialogError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {taskDialogError}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <Input
                  label="Task Title *"
                  value={taskForm.title}
                  onChange={(event) =>
                    setTaskForm({ ...taskForm, title: event.target.value })
                  }
                  autoFocus
                />
              </div>
              <Select
                label="Assigned Associate"
                value={taskForm.assigned_to_associate_id}
                onChange={(event) =>
                  setTaskForm({
                    ...taskForm,
                    assigned_to_associate_id: event.target.value
                  })
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
                onChange={(event) =>
                  setTaskForm({ ...taskForm, due_date: event.target.value })
                }
              />
              <Select
                label="Status"
                value={taskForm.status}
                onChange={(event) =>
                  setTaskForm({
                    ...taskForm,
                    status: event.target.value as CaseTaskStatus
                  })
                }
                options={CASE_TASK_STATUSES.map((status) => ({
                  value: status,
                  label: status
                }))}
              />
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Description
                </label>
                <textarea
                  value={taskForm.description}
                  onChange={(event) =>
                    setTaskForm({ ...taskForm, description: event.target.value })
                  }
                  rows={4}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="Add instructions or context for this task"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
              <Button
                variant="outline"
                onClick={closeSelectedCaseTaskDialog}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                onClick={() => void handleCreateTask(true)}
                disabled={saving || !taskForm.title.trim()}
              >
                <Plus className="mr-2 h-4 w-4" />
                {saving ? 'Adding...' : 'Add Task'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
