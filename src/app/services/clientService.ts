import { supabase } from '../lib/supabaseClient';

const normalizeClientData = (clientData: any) => ({
  ...clientData,
  birthdate: clientData.birthdate || null
});

const isDuplicateClientCodeError = (error: any) =>
  error?.code === '23505' &&
  String(error?.message || '')
    .toLowerCase()
    .includes('clients_client_code');

const createFallbackClientCode = () =>
  `CLT-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;

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

    // Prefer the database sequence. If an older deployed database trigger still
    // produces a duplicate, retry with a collision-resistant explicit code.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const clientCode = attempt === 0 ? null : createFallbackClientCode();
      const { data, error } = await supabase
        .from('clients')
        .insert([{ ...clientData, client_code: clientCode }])
        .select()
        .single();

      if (!error) return data;
      if (!isDuplicateClientCodeError(error)) throw error;
    }

    throw new Error('Unable to allocate a unique client code after 3 attempts.');
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
