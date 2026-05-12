import { supabase } from '../lib/supabaseClient';
import type { AssociateAvailability } from './scheduling.types';

export const dayNames = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
];

export const associateAvailabilityService = {
  async getAvailability(associateId?: string): Promise<AssociateAvailability[]> {
    let query = supabase
      .from('associate_availability')
      .select('*')
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true });

    if (associateId) {
      query = query.eq('associate_id', associateId);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  async addAvailability(data: Omit<AssociateAvailability, 'id' | 'created_at'>) {
    const { data: result, error } = await supabase
      .from('associate_availability')
      .insert([data])
      .select()
      .single();

    if (error) throw error;
    return result;
  },

  async updateAvailability(
    id: string,
    data: Partial<Omit<AssociateAvailability, 'id' | 'created_at'>>
  ) {
    const { data: result, error } = await supabase
      .from('associate_availability')
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return result;
  },

  async deleteAvailability(id: string) {
    const { error } = await supabase
      .from('associate_availability')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  }
};
