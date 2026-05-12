import React, { useEffect, useState } from 'react';
import { CalendarCheck, CreditCard, Pencil, XCircle } from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { AppointmentStatusBadge } from '../components/scheduling/AppointmentStatusBadge';
import { useAppContext } from '../context/AppContext';
import { appointmentService } from '../services/appointment.service';
import { auditService } from '../services/auditService';
import type { Appointment } from '../services/scheduling.types';

interface AppointmentDetailsProps {
  appointmentId: string | null;
  onBack: () => void;
  onEdit: (appointmentId: string) => void;
  onOpenTransactions: (transactionId: string) => void;
}

const formatCurrency = (amount: number) =>
  `PHP ${Number(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

export const AppointmentDetails: React.FC<AppointmentDetailsProps> = ({
  appointmentId,
  onBack,
  onEdit,
  onOpenTransactions
}) => {
  const { refreshData } = useAppContext();
  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const loadAppointment = async () => {
    if (!appointmentId) return;

    const data = await appointmentService.getAppointment(appointmentId);
    setAppointment(data);

    if (data) {
      const logs = await auditService.getLogsByRecord(data.id);
      setAuditLogs(logs);
    }
  };

  useEffect(() => {
    loadAppointment();
  }, [appointmentId]);

  const cancelAppointment = async () => {
    if (!appointment) return;

    const reason = window.prompt('Reason for cancellation?');
    if (!reason) return;

    try {
      setBusy(true);
      await appointmentService.cancelAppointment(appointment.id, reason);
      await loadAppointment();
    } catch (error: any) {
      alert(`Error cancelling appointment: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const markCompleted = async () => {
    if (!appointment) return;

    try {
      setBusy(true);
      await appointmentService.markCompleted(appointment.id);
      await loadAppointment();
    } catch (error: any) {
      alert(`Error completing appointment: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  const createTransaction = async () => {
    if (!appointment) return;

    try {
      setBusy(true);
      const result =
        await appointmentService.createPOSTransactionFromAppointment(appointment.id);
      await loadAppointment();
      await refreshData();
      alert('POS transaction created and linked to this appointment.');
      onOpenTransactions(result.transaction.id);
    } catch (error: any) {
      alert(`Error creating POS transaction: ${error.message}`);
    } finally {
      setBusy(false);
    }
  };

  if (!appointment) {
    return (
      <div className="space-y-6">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Card className="p-6">
          <p className="text-slate-600">Loading appointment...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">
            Appointment Details
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {appointment.client_name} · {appointment.service_name}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button variant="outline" onClick={() => onEdit(appointment.id)}>
            <Pencil className="w-4 h-4 mr-2" />
            Edit
          </Button>
          <Button variant="success" onClick={markCompleted} disabled={busy}>
            <CalendarCheck className="w-4 h-4 mr-2" />
            Mark Completed
          </Button>
          <Button variant="danger" onClick={cancelAppointment} disabled={busy}>
            <XCircle className="w-4 h-4 mr-2" />
            Cancel
          </Button>
        </div>
      </div>

      <Card className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-slate-500">Date</p>
            <p className="font-medium text-slate-900">
              {new Date(`${appointment.appointment_date}T00:00:00`).toLocaleDateString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Time</p>
            <p className="font-medium text-slate-900">
              {appointment.start_time.slice(0, 5)} - {appointment.end_time.slice(0, 5)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Type</p>
            <p className="font-medium text-slate-900">{appointment.appointment_type}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Associate</p>
            <p className="font-medium text-slate-900">{appointment.associate_name}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Referral</p>
            <p className="font-medium text-slate-900">
              {appointment.referral_name || 'Not selected'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Room</p>
            <p className="font-medium text-slate-900">
              {appointment.room_name || appointment.appointment_type}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Status</p>
            <div className="mt-1">
              <AppointmentStatusBadge status={appointment.status} />
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-500">Amount Due</p>
            <p className="font-medium text-slate-900">
              {formatCurrency(appointment.amount_due)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Amount Paid</p>
            <p className="font-medium text-slate-900">
              {formatCurrency(appointment.amount_paid)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Payment</p>
            <div className="mt-1">
              <AppointmentStatusBadge paymentStatus={appointment.payment_status} />
            </div>
          </div>
        </div>

        {appointment.notes && (
          <div className="mt-5 rounded-lg bg-slate-50 border border-slate-200 p-4 text-sm text-slate-600">
            {appointment.notes}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Linked POS Transaction
            </h3>
            <p className="text-sm text-slate-500">
              Create a POS transaction after scheduling, then collect payment from the transaction page.
            </p>
          </div>

          {appointment.transaction_id ? (
            <Button
              variant="outline"
              onClick={async () => {
                await refreshData();
                onOpenTransactions(appointment.transaction_id);
              }}
            >
              Open Transactions
            </Button>
          ) : (
            <Button onClick={createTransaction} disabled={busy}>
              <CreditCard className="w-4 h-4 mr-2" />
              Create POS Transaction
            </Button>
          )}
        </div>

        {appointment.transaction_id && (
          <div className="mt-4 rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800">
            Linked transaction ID: {appointment.transaction_id}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Audit Trail</h3>
        <div className="space-y-3">
          {auditLogs.map((log) => (
            <div key={log.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex justify-between gap-3">
                <p className="font-medium text-slate-900">{log.action}</p>
                <p className="text-xs text-slate-500">
                  {new Date(log.created_at).toLocaleString()}
                </p>
              </div>
              <p className="text-sm text-slate-600 mt-1">{log.reason || '-'}</p>
            </div>
          ))}

          {auditLogs.length === 0 && (
            <p className="text-sm text-slate-500">No audit logs yet.</p>
          )}
        </div>
      </Card>
    </div>
  );
};
