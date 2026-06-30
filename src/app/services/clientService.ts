import { supabase } from '../lib/supabaseClient';

const normalizeClientData = (clientData: any) => ({
  ...clientData,
  birthdate: clientData.birthdate || null
});

export const clientService = {
  async getClients() {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async addClient(clientData: any) {
    clientData = normalizeClientData(clientData);

    const { data, error } = await supabase
      .from('clients')
      .insert([{ ...clientData, client_code: null }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateClient(id: string, clientData: any) {
    clientData = normalizeClientData(clientData);

    const { data, error } = await supabase
      .from('clients')
      .update(clientData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async deleteClient(id: string) {
    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  }
};
