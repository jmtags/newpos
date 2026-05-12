import { supabase } from '../lib/supabaseClient';

export const auditService = {
  async addLog({
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    reason,
    performed_by = 'Admin User'
  }: any) {
    const { data, error } = await supabase
      .from('audit_logs')
      .insert([
        {
          table_name,
          record_id,
          action,
          old_data,
          new_data,
          reason,
          performed_by
        }
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getLogsByRecord(recordId: string) {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('record_id', recordId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }
};