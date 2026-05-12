import React from 'react';
import type {
  AppointmentPaymentStatus,
  AppointmentStatus
} from '../../services/scheduling.types';

const statusStyles: Record<AppointmentStatus, string> = {
  Scheduled: 'bg-blue-100 text-blue-700',
  Confirmed: 'bg-teal-100 text-teal-700',
  Completed: 'bg-green-100 text-green-700',
  Cancelled: 'bg-slate-100 text-slate-600',
  'No Show': 'bg-red-100 text-red-700',
  Rescheduled: 'bg-amber-100 text-amber-700'
};

const paymentStyles: Record<AppointmentPaymentStatus, string> = {
  Unpaid: 'bg-red-100 text-red-700',
  Partial: 'bg-amber-100 text-amber-700',
  Paid: 'bg-green-100 text-green-700',
  Waived: 'bg-slate-100 text-slate-600'
};

export const AppointmentStatusBadge: React.FC<{
  status?: AppointmentStatus;
  paymentStatus?: AppointmentPaymentStatus;
}> = ({ status, paymentStatus }) => {
  const label = status || paymentStatus || 'Scheduled';
  const className = status
    ? statusStyles[status]
    : paymentStyles[paymentStatus || 'Unpaid'];

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${className}`}>
      {label}
    </span>
  );
};
