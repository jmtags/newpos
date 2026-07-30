import { supabase } from '../lib/supabaseClient';

export type UserRole =
  | 'admin'
  | 'manager'
  | 'case_staff'
  | 'associate_user'
  | 'case_viewer'
  | 'expense_user'
  | 'regular_user';

export interface AppUser {
  id: string;
  auth_user_id: string | null;
  full_name: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
}

export const userService = {
  async getUsers() {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('full_name', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  async addUser(
    userData: Omit<
      AppUser,
      'id' | 'auth_user_id' | 'must_change_password' | 'created_at' | 'updated_at'
    >,
    temporaryPassword: string
  ) {
    const { data, error } = await supabase
      .rpc('admin_create_user', {
        new_full_name: userData.full_name,
        new_email: userData.email,
        new_role: userData.role,
        new_password: temporaryPassword,
        new_is_active: userData.is_active
      });

    if (error) throw error;
    return data;
  },

  async setUserPassword(id: string, temporaryPassword: string) {
    const { data, error } = await supabase.rpc('admin_set_user_password', {
      target_user_id: id,
      new_password: temporaryPassword
    });

    if (error) throw error;
    return data;
  },

  async completePasswordChange() {
    const { data, error } = await supabase.rpc('complete_password_change');

    if (error) throw error;
    return data;
  },

  async updateUser(id: string, userData: Partial<AppUser>) {
    const { data, error } = await supabase
      .from('users')
      .update(userData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteUser(id: string) {
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  }
};
