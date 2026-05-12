import { supabase } from '../lib/supabaseClient';

export const associateService = {
  async getAssociates() {
    const { data, error } = await supabase
      .from('mental_health_associates')
      .select('*')
      .order('full_name', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async addAssociate(associateData: any) {
    const { data, error } = await supabase
      .from('mental_health_associates')
      .insert([associateData])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateAssociate(id: string, associateData: any) {
    const { data, error } = await supabase
      .from('mental_health_associates')
      .update(associateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteAssociate(id: string) {
    const { error } = await supabase
      .from('mental_health_associates')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  }
};