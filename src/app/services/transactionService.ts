import { supabase } from '../lib/supabaseClient';

const mapAppointmentSchedule = (appointment: any) => {
  const room = Array.isArray(appointment.rooms)
    ? appointment.rooms[0]
    : appointment.rooms;

  return {
    id: appointment.id,
    appointment_date: appointment.appointment_date,
    start_time: appointment.start_time,
    end_time: appointment.end_time,
    appointment_type: appointment.appointment_type,
    status: appointment.status,
    room_name: room?.room_name || ''
  };
};

export const transactionService = {
  async getTransactions() {
    const { data, error } = await supabase
      .from('transactions')
      .select(`
        *,
        clients (
          full_name
        ),
        transaction_items (
          *
        ),
        payments (
          *
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const transactionRows = data || [];
    const transactionItemIds = transactionRows.flatMap((transaction: any) =>
      (transaction.transaction_items || []).map((item: any) => item.id)
    );
    const scheduleByTransactionItemId = new Map<string, any>();

    if (transactionItemIds.length > 0) {
      const { data: appointments, error: appointmentsError } = await supabase
        .from('appointments')
        .select(`
          id,
          transaction_item_id,
          appointment_date,
          start_time,
          end_time,
          appointment_type,
          status,
          rooms (
            room_name
          )
        `)
        .in('transaction_item_id', transactionItemIds);

      if (appointmentsError) {
        console.error(
          'Error loading appointment schedules for transactions:',
          appointmentsError
        );
      } else {
        (appointments || []).forEach((appointment: any) => {
          if (appointment.transaction_item_id) {
            scheduleByTransactionItemId.set(
              appointment.transaction_item_id,
              mapAppointmentSchedule(appointment)
            );
          }
        });
      }
    }

    return transactionRows.map((item: any) => ({
      id: item.id,
      transaction_number: item.transaction_number,
      client_id: item.client_id,
      client_name: item.clients?.full_name || '',
      transaction_date: item.transaction_date,
      subtotal: Number(item.subtotal || 0),
      discount_amount: Number(item.discount_amount || 0),
      tax_amount: Number(item.tax_amount || 0),
      tax_rate: Number(item.tax_rate || 0),
      tax_type: item.tax_type || 'NON_VAT',
      grand_total: Number(item.grand_total || item.total_amount || 0),
      total_amount: Number(item.total_amount || 0),
      total_paid: Number(item.total_paid || 0),
      balance: Number(item.balance || 0),
      payment_status: item.payment_status,
      notes: item.notes || '',
      created_by: item.created_by || '',
      is_void: Boolean(item.is_void),
      void_reason: item.void_reason || '',
      created_at: item.created_at,
      updated_at: item.updated_at,
      items: (item.transaction_items || []).map((transactionItem: any) => ({
        ...transactionItem,
        appointment_schedule:
          scheduleByTransactionItemId.get(transactionItem.id) || null
      })),
      payments: (item.payments || []).map((payment: any) => ({
        ...payment,
        amount: Number(payment.amount || 0)
      }))
    }));
  },

  async addTransaction(transactionData: any) {
    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .insert([
        {
          client_id: transactionData.client_id,
          transaction_date: transactionData.transaction_date,
          subtotal: transactionData.subtotal || 0,
          discount_amount: transactionData.discount_amount || 0,
          tax_amount: transactionData.tax_amount || 0,
          tax_rate: transactionData.tax_rate || 0,
          tax_type: transactionData.tax_type || 'NON_VAT',
          grand_total: transactionData.grand_total ?? transactionData.total_amount ?? 0,
          total_amount: transactionData.total_amount || 0,
          total_paid: transactionData.total_paid || 0,
          balance: transactionData.balance || 0,
          payment_status: transactionData.payment_status,
          notes: transactionData.notes,
          created_by: transactionData.created_by
        }
      ])
      .select()
      .single();

    if (transactionError) throw transactionError;

    const transactionId = transaction.id;

    if (transactionData.items?.length > 0) {
      const itemsToInsert = transactionData.items.map((item: any) => ({
        transaction_id: transactionId,
        service_id: item.service_id || null,
        service_name: item.service_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        discount_amount: item.discount_amount || 0,
        line_total: item.line_total || 0,
        associate_id: item.associate_id || null,
        associate_name: item.associate_name || null,
        referral_id: item.referral_id || null,
        referral_name: item.referral_name || null
      }));

      const { error: itemsError } = await supabase
        .from('transaction_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;
    }

    if (transactionData.payments?.length > 0) {
      const paymentsToInsert = transactionData.payments.map((payment: any) => ({
        transaction_id: transactionId,
        payment_method: payment.payment_method,
        amount: payment.amount,
        reference_number: payment.reference_number,
        payment_date: payment.payment_date,
        received_by: payment.received_by,
        notes: payment.notes
      }));

      const { error: paymentsError } = await supabase
        .from('payments')
        .insert(paymentsToInsert);

      if (paymentsError) throw paymentsError;
    }

    return transaction;
  },

  async updateTransaction(id: string, transactionData: any) {
    const { data, error } = await supabase
      .from('transactions')
      .update({
        transaction_date: transactionData.transaction_date,
        subtotal: transactionData.subtotal,
        discount_amount: transactionData.discount_amount,
        tax_amount: transactionData.tax_amount,
        tax_rate: transactionData.tax_rate,
        tax_type: transactionData.tax_type,
        grand_total: transactionData.grand_total,
        total_amount: transactionData.total_amount,
        total_paid: transactionData.total_paid,
        balance: transactionData.balance,
        payment_status: transactionData.payment_status,
        notes: transactionData.notes,
        created_by: transactionData.created_by
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async voidTransaction(id: string, reason: string) {
    const { data, error } = await supabase
      .from('transactions')
      .update({
        is_void: true,
        void_reason: reason,
        payment_status: 'Void'
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};
