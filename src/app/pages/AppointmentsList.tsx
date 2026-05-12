import React, { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Eye, Pencil, Search } from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { AppointmentStatusBadge } from '../components/scheduling/AppointmentStatusBadge';
import { appointmentService } from '../services/appointment.service';
import type { Appointment } from '../services/scheduling.types';

interface AppointmentsListProps {
  onCreate: () => void;
  onView: (appointmentId: string) => void;
  onEdit: (appointmentId: string) => void;
}

export const AppointmentsList: React.FC<AppointmentsListProps> = ({
  onCreate,
  onView,
  onEdit
}) => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const loadAppointments = async () => {
    const data = await appointmentService.getAppointments({
      date: dateFilter || undefined,
      status: statusFilter || undefined
    });
    setAppointments(data);
  };

  useEffect(() => {
    loadAppointments();
  }, [dateFilter, statusFilter]);

  const visibleAppointments = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return appointments;

    return appointments.filter((appointment) =>
      [
        appointment.client_name,
        appointment.service_name,
        appointment.referral_name,
        appointment.associate_name,
        appointment.room_name,
        appointment.status,
        appointment.payment_status
      ]
        .join(' ')
        .toLowerCase()
        .includes(keyword)
    );
  }, [appointments, search]);

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">
            Appointments
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Manage scheduled clinic appointments before payment is collected.
          </p>
        </div>

        <Button onClick={onCreate}>
          <CalendarPlus className="w-4 h-4 mr-2" />
          New Appointment
        </Button>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Input
            type="date"
            label="Date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
          />

          <Select
            label="Status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            options={[
              { value: '', label: 'All statuses' },
              { value: 'Scheduled', label: 'Scheduled' },
              { value: 'Confirmed', label: 'Confirmed' },
              { value: 'Completed', label: 'Completed' },
              { value: 'Cancelled', label: 'Cancelled' },
              { value: 'No Show', label: 'No Show' },
              { value: 'Rescheduled', label: 'Rescheduled' }
            ]}
          />

          <div className="md:col-span-2">
            <Input
              label="Search"
              placeholder="Client, service, associate, room"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left py-3 px-4 text-sm text-slate-600">Date / Time</th>
                <th className="text-left py-3 px-4 text-sm text-slate-600">Client</th>
                <th className="text-left py-3 px-4 text-sm text-slate-600">Service</th>
                <th className="text-left py-3 px-4 text-sm text-slate-600">Associate / Room</th>
                <th className="text-center py-3 px-4 text-sm text-slate-600">Status</th>
                <th className="text-center py-3 px-4 text-sm text-slate-600">Payment</th>
                <th className="text-right py-3 px-4 text-sm text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleAppointments.map((appointment) => (
                <tr key={appointment.id} className="border-b border-slate-100">
                  <td className="py-3 px-4 text-sm">
                    <p className="font-medium text-slate-900">
                      {new Date(`${appointment.appointment_date}T00:00:00`).toLocaleDateString()}
                    </p>
                    <p className="text-slate-500">
                      {appointment.start_time.slice(0, 5)} - {appointment.end_time.slice(0, 5)}
                    </p>
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-900">
                    {appointment.client_name}
                  </td>
                  <td className="py-3 px-4 text-sm text-slate-600">
                    <p>{appointment.service_name}</p>
                    <p className="text-xs text-slate-500">
                      Referral: {appointment.referral_name || 'Not selected'}
                    </p>
                  </td>
                  <td className="py-3 px-4 text-sm">
                    <p className="text-slate-900">{appointment.associate_name}</p>
                    <p className="text-slate-500">{appointment.room_name || appointment.appointment_type}</p>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <AppointmentStatusBadge status={appointment.status} />
                  </td>
                  <td className="py-3 px-4 text-center">
                    <AppointmentStatusBadge paymentStatus={appointment.payment_status} />
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => onView(appointment.id)}>
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onEdit(appointment.id)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}

              {visibleAppointments.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    <Search className="w-5 h-5 mx-auto mb-2" />
                    No appointments found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
