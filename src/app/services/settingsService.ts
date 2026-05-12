import { supabase } from '../lib/supabaseClient';
import type { TaxSettings } from './tax.service';

export interface ClinicSettings extends TaxSettings {
  id: string;
  clinic_name: string;
  address: string | null;
  contact_number: string | null;
  email: string | null;
  website: string | null;
  logo_url: string | null;
  receipt_footer: string | null;
  show_logo: boolean;
  include_terms: boolean;
  currency: string;
  privacy_notice: string | null;
  created_at: string;
  updated_at: string;
}

const applyClinicSettingsDefaults = (settings: any): ClinicSettings => ({
  ...settings,
  tax_enabled: settings?.tax_enabled ?? true,
  tax_type: settings?.tax_type || 'NON_VAT',
  tax_rate: Number(settings?.tax_rate ?? 12),
  tax_inclusive: settings?.tax_inclusive ?? true,
  bir_registered: settings?.bir_registered ?? false,
  tin_number: settings?.tin_number || ''
});

export const settingsService = {
  async getClinicSettings(): Promise<ClinicSettings> {
    const { data, error } = await supabase
      .from('clinic_settings')
      .select('*')
      .limit(1)
      .single();

    if (error) throw error;
    return applyClinicSettingsDefaults(data);
  },

  async updateClinicSettings(id: string, settingsData: any) {
    const { data, error } = await supabase
      .from('clinic_settings')
      .update(settingsData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async getPaymentMethods() {
    const { data, error } = await supabase
      .from('payment_methods')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async addPaymentMethod(methodData: any) {
    const { data, error } = await supabase
      .from('payment_methods')
      .insert([methodData])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updatePaymentMethod(id: string, methodData: any) {
    const { data, error } = await supabase
      .from('payment_methods')
      .update(methodData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deletePaymentMethod(id: string) {
    const { error } = await supabase
      .from('payment_methods')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  },

  async getDiscountTypes() {
    const { data, error } = await supabase
      .from('discount_types')
      .select('*')
      .order('name', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async addDiscountType(discountData: any) {
    const { data, error } = await supabase
      .from('discount_types')
      .insert([discountData])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateDiscountType(id: string, discountData: any) {
    const { data, error } = await supabase
      .from('discount_types')
      .update(discountData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteDiscountType(id: string) {
    const { error } = await supabase
      .from('discount_types')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  }
};
