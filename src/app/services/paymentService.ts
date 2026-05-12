import { supabase } from '../lib/supabaseClient';
import { appointmentService } from './appointment.service';

export const paymentService = {
  async addPayment(transactionId: string, paymentData: any) {
    const { data, error } = await supabase
      .from('payments')
      .insert([
        {
          transaction_id: transactionId,
          payment_method: paymentData.payment_method,
          amount: paymentData.amount,
          reference_number: paymentData.reference_number,
          payment_date: paymentData.payment_date,
          received_by: paymentData.received_by,
          notes: paymentData.notes
        }
      ])
      .select()
      .single();

    if (error) throw error;

    const { data: transaction } = await supabase
      .from('transactions')
      .select('id, total_amount, is_void')
      .eq('id', transactionId)
      .maybeSingle();

    const { data: payments } = await supabase
      .from('payments')
      .select('amount')
      .eq('transaction_id', transactionId);

    if (transaction) {
      const totalPaid = (payments || []).reduce(
        (sum: number, payment: any) => sum + Number(payment.amount || 0),
        0
      );
      const totalAmount = Number(transaction.total_amount || 0);
      const balance = Math.max(totalAmount - totalPaid, 0);
      const paymentStatus = transaction.is_void
        ? 'Void'
        : totalPaid <= 0
        ? 'Unpaid'
        : totalPaid < totalAmount
        ? 'Partial'
        : 'Paid';

      await supabase
        .from('transactions')
        .update({
          total_paid: totalPaid,
          balance,
          payment_status: paymentStatus
        })
        .eq('id', transactionId);

      await appointmentService.syncPaymentStatusFromTransaction(transactionId);
    }

    return data;
  },

  async getPaymentsByTransaction(transactionId: string) {
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('transaction_id', transactionId)
      .order('payment_date', { ascending: false });

    if (error) throw error;
    return data || [];
  }
};
