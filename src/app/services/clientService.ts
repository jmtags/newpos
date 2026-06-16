import { supabase } from '../lib/supabaseClient';

const CLIENT_CODE_PREFIX = 'CLT-';
const CLIENT_CODE_PADDING = 3;

const getNextClientCode = async () => {
  const { data, error } = await supabase
    .from('clients')
    .select('client_code');

  if (error) throw error;

  const maxClientNumber = (data || []).reduce((max, client) => {
    const match = client.client_code?.match(/^CLT-(\d+)$/);

    if (!match) return max;

    return Math.max(max, Number(match[1]));
  }, 0);

  return `${CLIENT_CODE_PREFIX}${String(maxClientNumber + 1).padStart(
    CLIENT_CODE_PADDING,
    '0'
  )}`;
};

const isDuplicateClientCodeError = (error: any) =>
  error?.code === '23505' &&
  String(error?.message || '').includes('clients_client_code_key');

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
    let lastError: any = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const clientCode = clientData.client_code || (await getNextClientCode());

      const { data, error } = await supabase
        .from('clients')
        .insert([{ ...clientData, client_code: clientCode }])
        .select()
        .single();

      if (!error) return data;

      lastError = error;

      if (!isDuplicateClientCodeError(error)) {
        throw error;
      }

      clientData = { ...clientData, client_code: '' };
    }

    throw lastError;
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
