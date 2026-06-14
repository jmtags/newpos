import { supabase } from '../lib/supabaseClient';

export const CASE_STATUSES = [
  'New',
  'Scheduled',
  'Testing Ongoing',
  'Testing Completed',
  'Scoring',
  'Interpretation',
  'Report Writing',
  'For Review',
  'For Revision',
  'Ready for Release',
  'Released',
  'Closed',
  'Cancelled'
] as const;

export const CASE_TASK_STATUSES = [
  'Pending',
  'In Progress',
  'Completed',
  'Cancelled'
] as const;

export type CaseStatus = (typeof CASE_STATUSES)[number];
export type CaseTaskStatus = (typeof CASE_TASK_STATUSES)[number];

export interface CaseRecord {
  id: string;
  case_number: string;
  client_id: string;
  client_name?: string | null;
  service_id: string | null;
  service_name?: string | null;
  transaction_id: string | null;
  transaction_item_id: string | null;
  appointment_id: string | null;
  associate_id: string | null;
  associate_name?: string | null;
  case_type: string;
  status: CaseStatus;
  priority: 'Low' | 'Normal' | 'High' | 'Urgent';
  presenting_concern: string | null;
  internal_notes: string | null;
  report_due_date: string | null;
  target_release_date: string | null;
  released_at: string | null;
  closed_at: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaseTask {
  id: string;
  case_id: string;
  title: string;
  description: string | null;
  status: CaseTaskStatus;
  assigned_to_user_id: string | null;
  assigned_to_associate_id: string | null;
  assigned_to_associate_name?: string | null;
  due_date: string | null;
  completed_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CaseProgressLog {
  id: string;
  case_id: string;
  from_status: CaseStatus | null;
  to_status: CaseStatus;
  notes: string | null;
  changed_by_user_id: string | null;
  changed_by_associate_id: string | null;
  created_at: string;
}

export interface CasePayload {
  case_number?: string | null;
  client_id: string;
  service_id?: string | null;
  transaction_id?: string | null;
  transaction_item_id?: string | null;
  appointment_id?: string | null;
  associate_id?: string | null;
  case_type?: string;
  status?: CaseStatus;
  priority?: 'Low' | 'Normal' | 'High' | 'Urgent';
  presenting_concern?: string | null;
  internal_notes?: string | null;
  report_due_date?: string | null;
  target_release_date?: string | null;
}

export interface CaseTaskPayload {
  case_id?: string;
  title?: string;
  description?: string | null;
  status?: CaseTaskStatus;
  assigned_to_user_id?: string | null;
  assigned_to_associate_id?: string | null;
  due_date?: string | null;
}

interface RpcEnvelope<T> {
  success: boolean;
  message: string;
  data?: T;
}

const assertValidCaseStatus = (status: string) => {
  if (!CASE_STATUSES.includes(status as CaseStatus)) {
    throw new Error(`Invalid case status: ${status}`);
  }
};

const assertValidTaskStatus = (status: string) => {
  if (!CASE_TASK_STATUSES.includes(status as CaseTaskStatus)) {
    throw new Error(`Invalid task status: ${status}`);
  }
};

const unwrapRpc = <T>(result: RpcEnvelope<T> | null): T => {
  if (!result) {
    throw new Error('No response was returned by the case management API.');
  }

  if (!result.success) {
    throw new Error(result.message || 'Case management request failed.');
  }

  return result.data as T;
};

const callRpc = async <T>(name: string, params?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(name, params || {});

  if (error) {
    throw new Error(error.message);
  }

  return unwrapRpc<T>(data as RpcEnvelope<T>);
};

export const caseManagementService = {
  async createCase(payload: CasePayload): Promise<CaseRecord> {
    if (payload.status) assertValidCaseStatus(payload.status);

    return callRpc<CaseRecord>('case_create_manual', { payload });
  },

  async createCaseFromTransactionItem(
    transactionItemId: string,
    payload: Omit<CasePayload, 'client_id' | 'transaction_id' | 'transaction_item_id'> = {}
  ): Promise<CaseRecord> {
    if (payload.status) assertValidCaseStatus(payload.status);

    return callRpc<CaseRecord>('case_create_from_transaction_item', {
      target_transaction_item_id: transactionItemId,
      payload
    });
  },

  async listCases(): Promise<CaseRecord[]> {
    return callRpc<CaseRecord[]>('case_list_all');
  },

  async listCasesByClient(clientId: string): Promise<CaseRecord[]> {
    return callRpc<CaseRecord[]>('case_list_by_client', {
      target_client_id: clientId
    });
  },

  async listCasesByAssociate(associateId: string): Promise<CaseRecord[]> {
    return callRpc<CaseRecord[]>('case_list_by_associate', {
      target_associate_id: associateId
    });
  },

  async listCasesByStatus(status: CaseStatus): Promise<CaseRecord[]> {
    assertValidCaseStatus(status);

    return callRpc<CaseRecord[]>('case_list_by_status', {
      target_status: status
    });
  },

  async listOverdueCases(targetDate?: string): Promise<CaseRecord[]> {
    return callRpc<CaseRecord[]>('case_list_overdue', {
      target_date: targetDate || new Date().toISOString().slice(0, 10)
    });
  },

  async updateCaseStatus(
    caseId: string,
    status: CaseStatus,
    notes?: string | null
  ): Promise<CaseRecord> {
    assertValidCaseStatus(status);

    return callRpc<CaseRecord>('case_update_status', {
      target_case_id: caseId,
      new_status: status,
      status_notes: notes || null
    });
  },

  async assignAssociate(
    caseId: string,
    associateId: string | null,
    assignmentNote?: string | null
  ): Promise<CaseRecord> {
    return callRpc<CaseRecord>('case_assign_associate', {
      target_case_id: caseId,
      target_associate_id: associateId,
      assignment_note: assignmentNote || null
    });
  },

  async createTask(payload: CaseTaskPayload & { case_id: string; title: string }): Promise<CaseTask> {
    if (payload.status) assertValidTaskStatus(payload.status);

    return callRpc<CaseTask>('case_task_create', { payload });
  },

  async updateTask(taskId: string, payload: CaseTaskPayload): Promise<CaseTask> {
    if (payload.status) assertValidTaskStatus(payload.status);

    return callRpc<CaseTask>('case_task_update', {
      target_task_id: taskId,
      payload
    });
  },

  async completeTask(taskId: string): Promise<CaseTask> {
    return callRpc<CaseTask>('case_task_complete', {
      target_task_id: taskId
    });
  },

  async listProgressLogs(caseId: string): Promise<CaseProgressLog[]> {
    return callRpc<CaseProgressLog[]>('case_list_progress_logs', {
      target_case_id: caseId
    });
  },

  async addProgressNote(
    caseId: string,
    progressNote: string
  ): Promise<CaseProgressLog> {
    return callRpc<CaseProgressLog>('case_add_progress_note', {
      target_case_id: caseId,
      progress_note: progressNote
    });
  }
};
