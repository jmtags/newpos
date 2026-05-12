import { supabase } from '../lib/supabaseClient';
import type { AssociateService, AssociateSkillLevel } from './scheduling.types';

export const skillLevelOptions: { value: AssociateSkillLevel; label: string }[] = [
  { value: 'qualified', label: 'Qualified' },
  { value: 'preferred', label: 'Preferred' },
  { value: 'specialist', label: 'Specialist' }
];

export const associateServicesService = {
  async getAssociateServices(associateId?: string): Promise<AssociateService[]> {
    let query = supabase
      .from('associate_services')
      .select(`
        *,
        services (name),
        mental_health_associates (full_name)
      `)
      .order('created_at', { ascending: false });

    if (associateId) {
      query = query.eq('associate_id', associateId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return (data || []).map((item: any) => ({
      ...item,
      service_name: item.services?.name || '',
      associate_name: item.mental_health_associates?.full_name || ''
    }));
  },

  async getServiceTagsForService(serviceId: string): Promise<AssociateService[]> {
    const { data, error } = await supabase
      .from('associate_services')
      .select('*')
      .eq('service_id', serviceId)
      .eq('is_active', true);

    if (error) throw error;
    return data || [];
  },

  async upsertAssociateService(data: {
    associate_id: string;
    service_id: string;
    is_preferred: boolean;
    skill_level: AssociateSkillLevel;
    notes?: string;
    is_active: boolean;
  }) {
    const { data: result, error } = await supabase
      .from('associate_services')
      .upsert([data], { onConflict: 'associate_id,service_id' })
      .select()
      .single();

    if (error) throw error;
    return result;
  },

  async updateAssociateService(id: string, data: Partial<AssociateService>) {
    const { data: result, error } = await supabase
      .from('associate_services')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return result;
  },

  async removeAssociateService(id: string) {
    const { error } = await supabase
      .from('associate_services')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  }
};
