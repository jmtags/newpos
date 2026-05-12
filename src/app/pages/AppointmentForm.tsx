import React, { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Save } from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { useAppContext } from '../context/AppContext';
import { associateService } from '../services/associateService';
import { appointmentService } from '../services/appointment.service';
import { associateServicesService } from '../services/associateServices.service';
import { referralService } from '../services/referralService';
import { schedulingRecommendationService } from '../services/schedulingRecommendation.service';
import type {
  Appointment,
  AppointmentPaymentStatus,
  AppointmentStatus,
  AppointmentType,
  Room
} from '../services/scheduling.types';

const today = () => new Date().toISOString().slice(0, 10);

const addMinutesToTime = (time: string, minutesToAdd: number) => {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date(2026, 0, 1, hours, minutes + minutesToAdd);
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes()
  ).padStart(2, '0')}`;
};

interface AppointmentFormProps {
  appointmentId?: string | null;
  onBack: () => void;
  onSaved: (appointment: Appointment) => void;
}

export const AppointmentForm: React.FC<AppointmentFormProps> = ({
  appointmentId,
  onBack,
  onSaved
}) => {
  const { clients, services } = useAppContext();
  const [associates, setAssociates] = useState<any[]>([]);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [availableRooms, setAvailableRooms] = useState<Room[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [warning, setWarning] = useState('');

  const [form, setForm] = useState({
    client_id: '',
    service_id: '',
    associate_id: '',
    referral_id: '',
    room_id: '',
    appointment_date: today(),
    start_time: '09:00',
    end_time: '10:00',
    status: 'Scheduled' as AppointmentStatus,
    appointment_type: 'In-person' as AppointmentType,
    payment_status: 'Unpaid' as AppointmentPaymentStatus,
    amount_due: 0,
    amount_paid: 0,
    notes: ''
  });

  const selectedService = services.find((service) => service.id === form.service_id);
  const selectedRecommendation = recommendations.find(
    (item) => item.associate_id === form.associate_id
  );

  const loadInitialData = async () => {
    const [associateData, referralData] = await Promise.all([
      associateService.getAssociates(),
      referralService.getReferrals()
    ]);

    setAssociates(associateData.filter((associate: any) => associate.is_active));
    setReferrals(referralData.filter((referral: any) => referral.is_active));

    if (appointmentId) {
      const appointment = await appointmentService.getAppointment(appointmentId);
      if (appointment) {
        setForm({
          client_id: appointment.client_id,
          service_id: appointment.service_id,
          associate_id: appointment.associate_id,
          referral_id: appointment.referral_id || '',
          room_id: appointment.room_id || '',
          appointment_date: appointment.appointment_date,
          start_time: appointment.start_time.slice(0, 5),
          end_time: appointment.end_time.slice(0, 5),
          status: appointment.status,
          appointment_type: appointment.appointment_type,
          payment_status: appointment.payment_status,
          amount_due: Number(appointment.amount_due || 0),
          amount_paid: Number(appointment.amount_paid || 0),
          notes: appointment.notes || ''
        });
      }
    }
  };

  useEffect(() => {
    loadInitialData();
  }, [appointmentId]);

  useEffect(() => {
    if (!selectedService || appointmentId) return;

    const duration = Number(selectedService.duration_minutes || 60);
    setForm((current) => ({
      ...current,
      amount_due: Number(selectedService.default_price || 0),
      end_time: addMinutesToTime(current.start_time, duration)
    }));
  }, [form.service_id, selectedService?.duration_minutes]);

  useEffect(() => {
    const loadRecommendations = async () => {
      if (!form.service_id || !form.appointment_date || !form.start_time || !form.end_time) {
        setRecommendations([]);
        setAvailableRooms([]);
        return;
      }

      try {
        const [recommendedAssociates, rooms] = await Promise.all([
          schedulingRecommendationService.getRecommendedAssociates({
            serviceId: form.service_id,
            appointmentDate: form.appointment_date,
            startTime: form.start_time,
            endTime: form.end_time,
            appointmentType: form.appointment_type,
            excludeAppointmentId: appointmentId || undefined
          }),
          schedulingRecommendationService.getAvailableRooms({
            appointmentDate: form.appointment_date,
            startTime: form.start_time,
            endTime: form.end_time,
            appointmentType: form.appointment_type,
            excludeAppointmentId: appointmentId || undefined
          })
        ]);

        setRecommendations(recommendedAssociates);
        setAvailableRooms(rooms);
      } catch (error) {
        console.error('Error loading scheduling recommendations:', error);
      }
    };

    loadRecommendations();
  }, [
    form.service_id,
    form.appointment_date,
    form.start_time,
    form.end_time,
    form.appointment_type,
    appointmentId
  ]);

  useEffect(() => {
    const validateAssociateTag = async () => {
      if (!form.associate_id || !form.service_id) {
        setWarning('');
        return;
      }

      const tags = await associateServicesService.getAssociateServices(form.associate_id);
      const tagged = tags.some(
        (tag) => tag.service_id === form.service_id && tag.is_active
      );

      setWarning(
        tagged
          ? ''
          : 'This associate is not currently tagged as preferred/qualified for this service. You may still proceed.'
      );
    };

    validateAssociateTag();
  }, [form.associate_id, form.service_id]);

  const clientOptions = useMemo(
    () => [
      { value: '', label: 'Select client...' },
      ...clients.map((client) => ({ value: client.id, label: client.full_name }))
    ],
    [clients]
  );

  const serviceOptions = useMemo(
    () => [
      { value: '', label: 'Select service...' },
      ...services
        .filter((service) => service.is_active)
        .map((service) => ({
          value: service.id,
          label: `${service.name} - PHP ${Number(service.default_price || 0).toLocaleString()}`
        }))
    ],
    [services]
  );

  const associateOptions = [
    { value: '', label: 'Select associate...' },
    ...associates.map((associate) => {
      const recommendation = recommendations.find(
        (item) => item.associate_id === associate.id
      );
      const labelParts = [associate.full_name];

      if (recommendation?.skill_level) labelParts.push(recommendation.skill_level);
      if (recommendation?.is_preferred) labelParts.push('preferred');
      if (recommendation?.has_conflict) labelParts.push('conflict');
      if (recommendation && !recommendation.is_available) labelParts.push('outside availability');

      return {
        value: associate.id,
        label: labelParts.join(' - ')
      };
    })
  ];

  const referralOptions = [
    { value: '', label: 'No referral selected' },
    ...referrals.map((referral) => ({
      value: referral.id,
      label: `${referral.referral_name}${
        referral.referral_type ? ` (${referral.referral_type})` : ''
      }`
    }))
  ];

  const roomOptions = [
    { value: '', label: form.appointment_type === 'Online' ? 'No room / Online' : 'Select room...' },
    ...availableRooms.map((room) => ({
      value: room.id,
      label: `${room.room_name}${room.room_type ? ` (${room.room_type})` : ''}`
    }))
  ];

  const saveAppointment = async () => {
    if (!form.client_id || !form.service_id || !form.associate_id) {
      alert('Please select client, service, and associate.');
      return;
    }

    if (form.appointment_type !== 'Online' && !form.room_id) {
      alert('Please select a room for in-person or hybrid appointments.');
      return;
    }

    try {
      setSaving(true);

      const payload = {
        ...form,
        referral_id: form.referral_id || null,
        room_id: form.room_id || null,
        amount_due: Number(form.amount_due || 0),
        amount_paid: Number(form.amount_paid || 0)
      };

      const saved = appointmentId
        ? await appointmentService.updateAppointment(appointmentId, payload)
        : await appointmentService.createAppointment(payload);

      onSaved(saved);
    } catch (error: any) {
      alert(`Error saving appointment: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">
            {appointmentId ? 'Edit Appointment' : 'Create Appointment'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Schedule first and collect payment later from the linked POS transaction.
          </p>
        </div>

        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-5">
          <CalendarPlus className="w-6 h-6 text-teal-600" />
          <h3 className="text-lg font-semibold text-slate-900">
            Appointment Details
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Select
            label="Client"
            options={clientOptions}
            value={form.client_id}
            onChange={(event) => setForm({ ...form, client_id: event.target.value })}
          />

          <Select
            label="Service"
            options={serviceOptions}
            value={form.service_id}
            onChange={(event) => setForm({ ...form, service_id: event.target.value })}
          />

          <Select
            label="Appointment Type"
            options={[
              { value: 'In-person', label: 'In-person' },
              { value: 'Online', label: 'Online' },
              { value: 'Hybrid', label: 'Hybrid' }
            ]}
            value={form.appointment_type}
            onChange={(event) =>
              setForm({
                ...form,
                appointment_type: event.target.value as AppointmentType,
                room_id: event.target.value === 'Online' ? '' : form.room_id
              })
            }
          />

          <Input
            type="date"
            label="Date"
            value={form.appointment_date}
            onChange={(event) =>
              setForm({ ...form, appointment_date: event.target.value })
            }
          />

          <Input
            type="time"
            label="Start Time"
            value={form.start_time}
            onChange={(event) =>
              setForm({
                ...form,
                start_time: event.target.value,
                end_time: selectedService
                  ? addMinutesToTime(
                      event.target.value,
                      Number(selectedService.duration_minutes || 60)
                    )
                  : form.end_time
              })
            }
          />

          <Input
            type="time"
            label="End Time"
            value={form.end_time}
            onChange={(event) => setForm({ ...form, end_time: event.target.value })}
          />

          <Select
            label="Associate"
            options={associateOptions}
            value={form.associate_id}
            onChange={(event) =>
              setForm({ ...form, associate_id: event.target.value })
            }
          />

          <Select
            label="Referral Source"
            options={referralOptions}
            value={form.referral_id}
            onChange={(event) =>
              setForm({ ...form, referral_id: event.target.value })
            }
          />

          <Select
            label="Room"
            options={roomOptions}
            value={form.room_id}
            onChange={(event) => setForm({ ...form, room_id: event.target.value })}
          />

          <Input
            type="number"
            label="Amount Due"
            value={form.amount_due}
            onChange={(event) =>
              setForm({ ...form, amount_due: Number(event.target.value) || 0 })
            }
          />

          <Select
            label="Status"
            options={[
              { value: 'Scheduled', label: 'Scheduled' },
              { value: 'Confirmed', label: 'Confirmed' },
              { value: 'Completed', label: 'Completed' },
              { value: 'Cancelled', label: 'Cancelled' },
              { value: 'No Show', label: 'No Show' },
              { value: 'Rescheduled', label: 'Rescheduled' }
            ]}
            value={form.status}
            onChange={(event) =>
              setForm({ ...form, status: event.target.value as AppointmentStatus })
            }
          />

          <div className="md:col-span-2">
            <Input
              label="Notes"
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </div>
        </div>

        {selectedRecommendation && (
          <div className="mt-4 rounded-lg border border-teal-100 bg-teal-50 p-3 text-sm text-teal-800">
            Recommendation score {selectedRecommendation.score}. Daily workload:{' '}
            {selectedRecommendation.workload}. Skill:{' '}
            {selectedRecommendation.skill_level || 'not tagged'}.
          </div>
        )}

        {warning && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {warning}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onBack}>
            Cancel
          </Button>
          <Button onClick={saveAppointment} disabled={saving}>
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : 'Save Appointment'}
          </Button>
        </div>
      </Card>
    </div>
  );
};
