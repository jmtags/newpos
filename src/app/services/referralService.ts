import { supabase } from '../lib/supabaseClient';

export const referralService = {
  async getReferrals() {
    const { data, error } = await supabase
      .from('referrals')
      .select('*')
      .order('referral_name', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async addReferral(referralData: any) {
    const { data, error } = await supabase
      .from('referrals')
      .insert([referralData])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateReferral(id: string, referralData: any) {
    const { data, error } = await supabase
      .from('referrals')
      .update(referralData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteReferral(id: string) {
    const { error } = await supabase
      .from('referrals')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  }
};