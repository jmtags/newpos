import { supabase } from '../lib/supabaseClient';
import { auditService } from './auditService';
import { settingsService } from './settingsService';
import { taxService } from './tax.service';
import { transactionService } from './transactionService';
import { rangesOverlap, getDayOfWeek, toMinutes } from './schedulingRecommendation.service';
import type {
  Appointment,
  AppointmentPaymentStatus,
  AppointmentPayload,
  ConflictCheckResult
} from './scheduling.types';

const mapAppointment = (item: any): Appointment => ({
  ...item,
  amount_due: Number(item.amount_due || 0),
  amount_paid: Number(item.amount_paid || 0),
  client_name: item.clients?.full_name || '',
  service_name: item.services?.name || '',
  service_price: Number(item.services?.default_price || 0),
  associate_name: item.mental_health_associates?.full_name || '',
  referral_name: item.referrals?.referral_name || '',
  room_name: item.rooms?.room_name || ''
});

const appointmentSelect = `
  *,
  clients (full_name),
  services (name, default_price, is_active),
  mental_health_associates (full_name, is_active),
  referrals (referral_name),
  rooms (room_name, is_active)
`;

const getPaymentStatus = (
  amountDue: number,
  amountPaid: number
): AppointmentPaymentStatus => {
  if (amountDue <= 0) return 'Waived';
  if (amountPaid <= 0) return 'Unpaid';
  if (amountPaid < amountDue) return 'Partial';
  return 'Paid';
};

export const appointmentService = {
  async getAppointments(filters?: {
    date?: string;
    startDate?: string;
    endDate?: string;
    associateId?: string;
    roomId?: string;
    serviceId?: string;
    status?: string;
  }): Promise<Appointment[]> {
    let query = supabase
      .from('appointments')
      .select(appointmentSelect)
      .order('appointment_date', { ascending: false })
      .order('start_time', { ascending: true });

    if (filters?.date) query = query.eq('appointment_date', filters.date);
    if (filters?.startDate) query = query.gte('appointment_date', filters.startDate);
    if (filters?.endDate) query = query.lte('appointment_date', filters.endDate);
    if (filters?.associateId) query = query.eq('associate_id', filters.associateId);
    if (filters?.roomId) query = query.eq('room_id', filters.roomId);
    if (filters?.serviceId) query = query.eq('service_id', filters.serviceId);
    if (filters?.status) query = query.eq('status', filters.status);

    const { data, error } = await query;

    if (error) throw error;
    return (data || []).map(mapAppointment);
  },

  async getAppointment(id: string): Promise<Appointment | null> {
    const { data, error } = await supabase
      .from('appointments')
      .select(appointmentSelect)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    return data ? mapAppointment(data) : null;
  },

  async checkConflicts(
    payload: AppointmentPayload,
    excludeAppointmentId?: string
  ): Promise<ConflictCheckResult> {
    const messages: string[] = [];

    const [serviceResult, associateResult, roomResult, availabilityResult, appointmentsResult] =
      await Promise.all([
        supabase
          .from('services')
          .select('id, name, is_active')
          .eq('id', payload.service_id)
          .maybeSingle(),
        supabase
          .from('mental_health_associates')
          .select('id, full_name, is_active')
          .eq('id', payload.associate_id)
          .maybeSingle(),
        payload.room_id
          ? supabase
              .from('rooms')
              .select('id, room_name, is_active')
              .eq('id', payload.room_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        supabase
          .from('associate_availability')
          .select('*')
          .eq('associate_id', payload.associate_id)
          .eq('day_of_week', getDayOfWeek(payload.appointment_date))
          .eq('is_active', true),
        supabase
          .from('appointments')
          .select('id, client_id, associate_id, room_id, start_time, end_time, status')
          .eq('appointment_date', payload.appointment_date)
          .neq('status', 'Cancelled')
      ]);

    if (serviceResult.error) throw serviceResult.error;
    if (associateResult.error) throw associateResult.error;
    if (roomResult.error) throw roomResult.error;
    if (availabilityResult.error) throw availabilityResult.error;
    if (appointmentsResult.error) throw appointmentsResult.error;

    if (!serviceResult.data?.is_active) {
      messages.push('Selected service is inactive or no longer exists.');
    }

    if (!associateResult.data?.is_active) {
      messages.push('Selected associate is inactive or no longer exists.');
    }

    if (payload.room_id && !roomResult.data?.is_active) {
      messages.push('Selected room is inactive or no longer exists.');
    }

    const isWithinAvailability = (availabilityResult.data || []).some((row: any) => {
      return (
        toMinutes(row.start_time) <= toMinutes(payload.start_time) &&
        toMinutes(row.end_time) >= toMinutes(payload.end_time)
      );
    });

    if (!isWithinAvailability) {
      messages.push('Appointment time is outside the associate availability.');
    }

    const overlappingAppointments = (appointmentsResult.data || []).filter(
      (appointment: any) =>
        appointment.id !== excludeAppointmentId &&
        rangesOverlap(
          payload.start_time,
          payload.end_time,
          appointment.start_time,
          appointment.end_time
        )
    );

    if (
      overlappingAppointments.some(
        (appointment: any) => appointment.associate_id === payload.associate_id
      )
    ) {
      messages.push('Selected associate already has an overlapping appointment.');
    }

    if (
      payload.room_id &&
      overlappingAppointments.some(
        (appointment: any) => appointment.room_id === payload.room_id
      )
    ) {
      messages.push('Selected room already has an overlapping appointment.');
    }

    if (
      overlappingAppointments.some(
        (appointment: any) => appointment.client_id === payload.client_id
      )
    ) {
      messages.push('Selected client already has an overlapping appointment.');
    }

    return {
      valid: messages.length === 0,
      messages
    };
  },

  async createAppointment(payload: AppointmentPayload) {
    const conflictCheck = await this.checkConflicts(payload);

    if (!conflictCheck.valid) {
      throw new Error(conflictCheck.messages.join('\n'));
    }

    const { data, error } = await supabase
      .from('appointments')
      .insert([
        {
          ...payload,
          referral_id: payload.referral_id || null,
          room_id: payload.room_id || null,
          amount_paid: payload.amount_paid || 0,
          notes: payload.notes || null,
          cancellation_reason: payload.cancellation_reason || null
        }
      ])
      .select(appointmentSelect)
      .single();

    if (error) throw error;
    const appointment = mapAppointment(data);

    await auditService.addLog({
      table_name: 'appointments',
      record_id: appointment.id,
      action: 'CREATE_APPOINTMENT',
      old_data: null,
      new_data: appointment,
      reason: appointment.notes || 'Appointment scheduled',
      performed_by: 'Admin User'
    });

    return appointment;
  },

  async updateAppointment(id: string, payload: AppointmentPayload) {
    const previous = await this.getAppointment(id);
    const conflictCheck = await this.checkConflicts(payload, id);

    if (!conflictCheck.valid) {
      throw new Error(conflictCheck.messages.join('\n'));
    }

    const { data, error } = await supabase
      .from('appointments')
      .update({
        ...payload,
        referral_id: payload.referral_id || null,
        room_id: payload.room_id || null,
        notes: payload.notes || null,
        cancellation_reason: payload.cancellation_reason || null
      })
      .eq('id', id)
      .select(appointmentSelect)
      .single();

    if (error) throw error;
    const appointment = mapAppointment(data);
    const rescheduled =
      previous?.appointment_date !== appointment.appointment_date ||
      previous?.start_time !== appointment.start_time ||
      previous?.end_time !== appointment.end_time;

    await auditService.addLog({
      table_name: 'appointments',
      record_id: id,
      action: rescheduled ? 'RESCHEDULE_APPOINTMENT' : 'UPDATE_APPOINTMENT',
      old_data: previous,
      new_data: appointment,
      reason: appointment.notes || 'Appointment updated',
      performed_by: 'Admin User'
    });

    return appointment;
  },

  async cancelAppointment(id: string, reason: string) {
    const previous = await this.getAppointment(id);
    const { data, error } = await supabase
      .from('appointments')
      .update({
        status: 'Cancelled',
        cancellation_reason: reason
      })
      .eq('id', id)
      .select(appointmentSelect)
      .single();

    if (error) throw error;
    const appointment = mapAppointment(data);

    await auditService.addLog({
      table_name: 'appointments',
      record_id: id,
      action: 'CANCEL_APPOINTMENT',
      old_data: previous,
      new_data: appointment,
      reason,
      performed_by: 'Admin User'
    });

    return appointment;
  },

  async markCompleted(id: string) {
    const previous = await this.getAppointment(id);
    const { data, error } = await supabase
      .from('appointments')
      .update({ status: 'Completed' })
      .eq('id', id)
      .select(appointmentSelect)
      .single();

    if (error) throw error;
    const appointment = mapAppointment(data);

    await auditService.addLog({
      table_name: 'appointments',
      record_id: id,
      action: 'COMPLETE_APPOINTMENT',
      old_data: previous,
      new_data: appointment,
      reason: 'Appointment marked completed',
      performed_by: 'Admin User'
    });

    return appointment;
  },

  async syncPaymentStatusFromTransaction(transactionId: string) {
    const { data: transaction, error: transactionError } = await supabase
      .from('transactions')
      .select('id, total_amount, total_paid')
      .eq('id', transactionId)
      .maybeSingle();

    if (transactionError) throw transactionError;
    if (!transaction) return null;

    const amountDue = Number(transaction.total_amount || 0);
    const amountPaid = Number(transaction.total_paid || 0);

    const { data, error } = await supabase
      .from('appointments')
      .update({
        amount_due: amountDue,
        amount_paid: amountPaid,
        payment_status: getPaymentStatus(amountDue, amountPaid)
      })
      .eq('transaction_id', transactionId)
      .select(appointmentSelect);

    if (error) throw error;
    return (data || []).map(mapAppointment);
  },

  async createPOSTransactionFromAppointment(id: string) {
    const appointment = await this.getAppointment(id);

    if (!appointment) throw new Error('Appointment not found.');
    if (appointment.transaction_id) {
      throw new Error('This appointment is already linked to a POS transaction.');
    }

    const settings = await settingsService.getClinicSettings();
    const computedTax = taxService.computeTax(appointment.amount_due, settings);

    const transaction = await transactionService.addTransaction({
      client_id: appointment.client_id,
      client_name: appointment.client_name,
      transaction_date: new Date().toISOString(),
      subtotal: computedTax.subtotal,
      discount_amount: 0,
      tax_amount: computedTax.tax,
      tax_rate: computedTax.taxRate,
      tax_type: computedTax.taxType,
      grand_total: computedTax.total,
      total_amount: computedTax.total,
      total_paid: 0,
      balance: computedTax.total,
      payment_status: 'Unpaid',
      notes: `Created from appointment ${appointment.appointment_date} ${appointment.start_time}`,
      created_by: 'Admin User',
      items: [
        {
          transaction_id: '',
          service_id: appointment.service_id,
          service_name: appointment.service_name || 'Appointment Service',
          quantity: 1,
          unit_price: appointment.amount_due,
          discount_amount: 0,
          line_total: appointment.amount_due,
          associate_id: appointment.associate_id,
          associate_name: appointment.associate_name || null,
          referral_id: appointment.referral_id || null,
          referral_name: appointment.referral_name || null
        }
      ],
      payments: []
    });

    const { data: item } = await supabase
      .from('transaction_items')
      .select('id')
      .eq('transaction_id', transaction.id)
      .maybeSingle();

    const { data, error } = await supabase
      .from('appointments')
      .update({
        transaction_id: transaction.id,
        transaction_item_id: item?.id || null,
        amount_due: computedTax.total,
        amount_paid: 0,
        payment_status: 'Unpaid'
      })
      .eq('id', id)
      .select(appointmentSelect)
      .single();

    if (error) throw error;
    const linkedAppointment = mapAppointment(data);

    await auditService.addLog({
      table_name: 'appointments',
      record_id: id,
      action: 'CONVERT_APPOINTMENT_TO_POS',
      old_data: appointment,
      new_data: {
        appointment: linkedAppointment,
        transaction_id: transaction.id,
        transaction_item_id: item?.id || null
      },
      reason: 'POS transaction created from appointment',
      performed_by: 'Admin User'
    });

    return {
      appointment: linkedAppointment,
      transaction
    };
  }
};
