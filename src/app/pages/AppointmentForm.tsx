import React, { useEffect, useMemo, useState } from 'react';
import { Building2, CalendarPlus, CalendarSearch, Clock, Save } from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { Modal } from '../components/Modal';
import { useAppContext } from '../context/AppContext';
import { associateService } from '../services/associateService';
import { appointmentService } from '../services/appointment.service';
import { associateAvailabilityService } from '../services/associateAvailability.service';
import { associateServicesService } from '../services/associateServices.service';
import { referralService } from '../services/referralService';
import {
  getDayOfWeek,
  schedulingRecommendationService,
  toMinutes
} from '../services/schedulingRecommendation.service';
import type {
  Appointment,
  AppointmentPaymentStatus,
  AppointmentStatus,
  AppointmentType,
  AssociateAvailability,
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

const formatTime = (time: string) => {
  const [hours, minutes] = time.slice(0, 5).split(':').map(Number);
  return new Date(2026, 0, 1, hours, minutes).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  });
};

const getDurationMinutes = (startTime: string, endTime: string) =>
  Math.max(toMinutes(endTime) - toMinutes(startTime), 15);

const minutesToTime = (minutesValue: number) =>
  `${String(Math.floor(minutesValue / 60)).padStart(2, '0')}:${String(
    minutesValue % 60
  ).padStart(2, '0')}`;

const toDateInputValue = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const toMonthInputValue = (dateValue: string) => dateValue.slice(0, 7);

const getMonthRange = (monthValue: string) => {
  const [year, month] = monthValue.split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);

  return {
    startDate: toDateInputValue(start),
    endDate: toDateInputValue(end)
  };
};

const buildMiniMonthGrid = (monthValue: string) => {
  const [year, month] = monthValue.split('-').map(Number);
  const firstOfMonth = new Date(year, month - 1, 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);

    return {
      dateKey: toDateInputValue(date),
      dayNumber: date.getDate(),
      isCurrentMonth: date.getMonth() === month - 1
    };
  });
};

const formatMonthLabel = (monthValue: string) => {
  const [year, month] = monthValue.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  });
};

const dayNames = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday'
];

interface ScheduleSlot {
  start: string;
  end: string;
  isBooked: boolean;
}

const buildScheduleSlots = ({
  ranges,
  duration,
  appointments,
  excludeAppointmentId
}: {
  ranges: { start_time: string; end_time: string }[];
  duration: number;
  appointments: Appointment[];
  excludeAppointmentId?: string | null;
}): ScheduleSlot[] => {
  const busyAppointments = appointments.filter(
    (appointment) =>
      appointment.id !== excludeAppointmentId && appointment.status !== 'Cancelled'
  );

  return ranges.flatMap((range) => {
    const slots: ScheduleSlot[] = [];
    const rangeStart = toMinutes(range.start_time);
    const rangeEnd = toMinutes(range.end_time);

    for (
      let slotStart = rangeStart;
      slotStart + duration <= rangeEnd;
      slotStart += 15
    ) {
      const slotEnd = slotStart + duration;
      const isBooked = busyAppointments.some(
        (appointment) =>
          slotStart < toMinutes(appointment.end_time) &&
          slotEnd > toMinutes(appointment.start_time)
      );

      slots.push({
        start: minutesToTime(slotStart),
        end: minutesToTime(slotEnd),
        isBooked
      });
    }

    return slots;
  });
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
  const [showAssociateSchedule, setShowAssociateSchedule] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleAvailability, setScheduleAvailability] = useState<
    AssociateAvailability[]
  >([]);
  const [scheduleAppointments, setScheduleAppointments] = useState<Appointment[]>(
    []
  );
  const [selectedAssociateSlotStarts, setSelectedAssociateSlotStarts] = useState<
    string[]
  >([]);
  const [associateMonthAppointments, setAssociateMonthAppointments] = useState<
    Appointment[]
  >([]);
  const [showRoomSchedule, setShowRoomSchedule] = useState(false);
  const [roomScheduleLoading, setRoomScheduleLoading] = useState(false);
  const [roomScheduleAppointments, setRoomScheduleAppointments] = useState<
    Appointment[]
  >([]);

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
  const selectedAssociate = associates.find(
    (associate) => associate.id === form.associate_id
  );
  const selectedRoom = availableRooms.find((room) => room.id === form.room_id);
  const selectedRecommendation = recommendations.find(
    (item) => item.associate_id === form.associate_id
  );
  const scheduleMonth = toMonthInputValue(form.appointment_date);

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

  useEffect(() => {
    if (!showAssociateSchedule || !form.associate_id || !form.appointment_date) return;

    setSelectedAssociateSlotStarts([]);
    loadAssociateSchedule();
  }, [showAssociateSchedule, form.associate_id, form.appointment_date]);

  useEffect(() => {
    if (!showAssociateSchedule || !form.associate_id || !scheduleMonth) return;

    loadAssociateMonthSchedule();
  }, [showAssociateSchedule, form.associate_id, scheduleMonth]);

  useEffect(() => {
    if (!showRoomSchedule || !form.room_id || !form.appointment_date) return;

    loadRoomSchedule();
  }, [showRoomSchedule, form.room_id, form.appointment_date]);

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

  const appointmentDuration = selectedService
    ? Number(selectedService.duration_minutes || 60)
    : getDurationMinutes(form.start_time, form.end_time);

  const sortedScheduleAppointments = useMemo(
    () =>
      [...scheduleAppointments].sort(
        (a, b) => toMinutes(a.start_time) - toMinutes(b.start_time)
      ),
    [scheduleAppointments]
  );

  const associateScheduleSlots = useMemo(() => {
    const dayAvailability = scheduleAvailability
      .filter(
        (item) =>
          item.is_active && item.day_of_week === getDayOfWeek(form.appointment_date)
      )
      .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time));

    return buildScheduleSlots({
      ranges: dayAvailability,
      duration: appointmentDuration,
      appointments: sortedScheduleAppointments,
      excludeAppointmentId: appointmentId
    });
  }, [
    appointmentDuration,
    appointmentId,
    form.appointment_date,
    scheduleAppointments,
    scheduleAvailability,
    sortedScheduleAppointments
  ]);

  const sortedRoomScheduleAppointments = useMemo(
    () =>
      [...roomScheduleAppointments].sort(
        (a, b) => toMinutes(a.start_time) - toMinutes(b.start_time)
      ),
    [roomScheduleAppointments]
  );

  const roomScheduleSlots = useMemo(
    () =>
      buildScheduleSlots({
        ranges: [{ start_time: '08:00', end_time: '18:00' }],
        duration: appointmentDuration,
        appointments: sortedRoomScheduleAppointments,
        excludeAppointmentId: appointmentId
      }),
    [appointmentDuration, appointmentId, sortedRoomScheduleAppointments]
  );

  const selectedAssociateSlots = useMemo(
    () =>
      associateScheduleSlots.filter((slot) =>
        selectedAssociateSlotStarts.includes(slot.start)
      ),
    [associateScheduleSlots, selectedAssociateSlotStarts]
  );

  const selectedAssociateTimeRange = useMemo(() => {
    if (selectedAssociateSlots.length === 0) return null;

    const sortedSlots = [...selectedAssociateSlots].sort(
      (a, b) => toMinutes(a.start) - toMinutes(b.start)
    );

    return {
      start: sortedSlots[0].start,
      end: sortedSlots[sortedSlots.length - 1].end
    };
  }, [selectedAssociateSlots]);

  const associateAvailabilitySummary = useMemo(() => {
    const activeAvailability = [...scheduleAvailability]
      .filter((item) => item.is_active)
      .sort(
        (a, b) =>
          a.day_of_week - b.day_of_week ||
          toMinutes(a.start_time) - toMinutes(b.start_time)
      );

    if (activeAvailability.length === 0) return 'No availability set';

    return activeAvailability
      .map(
        (item) =>
          `${dayNames[item.day_of_week]} ${formatTime(item.start_time)} - ${formatTime(
            item.end_time
          )}`
      )
      .join(', ');
  }, [scheduleAvailability]);

  const associateScheduleDates = useMemo(() => {
    return associateMonthAppointments.reduce<Record<string, number>>(
      (grouped, appointment) => ({
        ...grouped,
        [appointment.appointment_date]:
          (grouped[appointment.appointment_date] || 0) + 1
      }),
      {}
    );
  }, [associateMonthAppointments]);

  const miniMonthDays = useMemo(
    () => buildMiniMonthGrid(scheduleMonth),
    [scheduleMonth]
  );

  const loadAssociateSchedule = async () => {
    if (!form.associate_id || !form.appointment_date) return;

    try {
      setScheduleLoading(true);
      const [availability, appointments] = await Promise.all([
        associateAvailabilityService.getAvailability(form.associate_id),
        appointmentService.getAppointments({
          date: form.appointment_date,
          associateId: form.associate_id
        })
      ]);

      setScheduleAvailability(availability);
      setScheduleAppointments(appointments);
    } catch (error: any) {
      console.error('Error loading associate schedule:', error);
      alert(`Error loading associate schedule: ${error.message}`);
    } finally {
      setScheduleLoading(false);
    }
  };

  const loadAssociateMonthSchedule = async () => {
    if (!form.associate_id || !scheduleMonth) return;

    try {
      const monthRange = getMonthRange(scheduleMonth);
      const appointments = await appointmentService.getAppointments({
        startDate: monthRange.startDate,
        endDate: monthRange.endDate,
        associateId: form.associate_id
      });

      setAssociateMonthAppointments(appointments);
    } catch (error: any) {
      console.error('Error loading associate month schedule:', error);
    }
  };

  const loadRoomSchedule = async () => {
    if (!form.room_id || !form.appointment_date) return;

    try {
      setRoomScheduleLoading(true);
      const appointments = await appointmentService.getAppointments({
        date: form.appointment_date,
        roomId: form.room_id
      });

      setRoomScheduleAppointments(appointments);
    } catch (error: any) {
      console.error('Error loading room schedule:', error);
      alert(`Error loading room schedule: ${error.message}`);
    } finally {
      setRoomScheduleLoading(false);
    }
  };

  const openAssociateSchedule = () => {
    if (!form.associate_id) {
      alert('Please select an associate first.');
      return;
    }

    setSelectedAssociateSlotStarts([]);
    setShowAssociateSchedule(true);
  };

  const toggleAssociateScheduleSlot = (slot: ScheduleSlot) => {
    if (slot.isBooked) return;

    const slotIndex = associateScheduleSlots.findIndex(
      (item) => item.start === slot.start && item.end === slot.end
    );

    setSelectedAssociateSlotStarts((current) => {
      if (current.includes(slot.start)) {
        if (current.length === 1) return [];

        const selectedIndexes = current
          .map((start) =>
            associateScheduleSlots.findIndex((item) => item.start === start)
          )
          .filter((index) => index >= 0)
          .sort((a, b) => a - b);
        const firstIndex = selectedIndexes[0];
        const lastIndex = selectedIndexes[selectedIndexes.length - 1];

        if (slotIndex !== firstIndex && slotIndex !== lastIndex) {
          return current;
        }

        return current.filter((start) => start !== slot.start);
      }

      if (current.length === 0) return [slot.start];

      const selectedIndexes = current
        .map((start) =>
          associateScheduleSlots.findIndex((item) => item.start === start)
        )
        .filter((index) => index >= 0);
      const firstIndex = Math.min(...selectedIndexes);
      const lastIndex = Math.max(...selectedIndexes);

      if (slotIndex === firstIndex - 1 || slotIndex === lastIndex + 1) {
        return [...current, slot.start].sort(
          (a, b) => toMinutes(a) - toMinutes(b)
        );
      }

      return current;
    });
  };

  const applyAssociateScheduleSelection = () => {
    if (!selectedAssociateTimeRange) return;

    setForm({
      ...form,
      start_time: selectedAssociateTimeRange.start,
      end_time: selectedAssociateTimeRange.end
    });
    setShowAssociateSchedule(false);
    setSelectedAssociateSlotStarts([]);
  };

  const pickScheduleSlot = (slot: { start: string; end: string }) => {
    if ('isBooked' in slot && slot.isBooked) return;

    setForm({
      ...form,
      start_time: slot.start,
      end_time: slot.end
    });
    setShowAssociateSchedule(false);
    setShowRoomSchedule(false);
  };

  const openRoomSchedule = () => {
    if (!form.room_id) {
      alert('Please select a room first.');
      return;
    }

    setShowRoomSchedule(true);
  };

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

          <div>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Select
                  label="Associate"
                  options={associateOptions}
                  value={form.associate_id}
                  onChange={(event) =>
                    setForm({ ...form, associate_id: event.target.value })
                  }
                />
              </div>
              <button
                type="button"
                onClick={openAssociateSchedule}
                className="mb-1 h-10 w-10 shrink-0 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center"
                title="View associate schedule"
                disabled={!form.associate_id}
              >
                <CalendarSearch className="h-4 w-4" />
              </button>
            </div>
          </div>

          <Select
            label="Referral Source"
            options={referralOptions}
            value={form.referral_id}
            onChange={(event) =>
              setForm({ ...form, referral_id: event.target.value })
            }
          />

          <div>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Select
                  label="Room"
                  options={roomOptions}
                  value={form.room_id}
                  onChange={(event) =>
                    setForm({ ...form, room_id: event.target.value })
                  }
                />
              </div>
              <button
                type="button"
                onClick={openRoomSchedule}
                className="mb-1 h-10 w-10 shrink-0 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 flex items-center justify-center"
                title="View room schedule"
                disabled={!form.room_id}
              >
                <Building2 className="h-4 w-4" />
              </button>
            </div>
          </div>

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

      <Modal
        isOpen={showAssociateSchedule}
        onClose={() => setShowAssociateSchedule(false)}
        title="Associate Schedule"
        size="lg"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="md:col-span-2">
              <p className="text-xs text-slate-500">Associate</p>
              <p className="font-medium text-slate-900">
                {selectedAssociate?.full_name || 'Selected associate'}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {associateAvailabilitySummary}
              </p>
            </div>

            <Input
              type="date"
              label="Date"
              value={form.appointment_date}
              onChange={(event) =>
                setForm({ ...form, appointment_date: event.target.value })
              }
            />
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">
                {formatMonthLabel(scheduleMonth)}
              </p>
              <p className="text-xs text-slate-500">
                Marked dates have bookings
              </p>
            </div>

            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-500">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, index) => (
                <div key={`${label}-${index}`} className="py-1">
                  {label}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {miniMonthDays.map((day) => {
                const appointmentCount = associateScheduleDates[day.dateKey] || 0;
                const isSelected = day.dateKey === form.appointment_date;

                return (
                  <button
                    key={day.dateKey}
                    type="button"
                    onClick={() =>
                      setForm({ ...form, appointment_date: day.dateKey })
                    }
                    className={`relative h-9 rounded-md text-sm transition-colors ${
                      isSelected
                        ? 'bg-teal-600 text-white'
                        : appointmentCount > 0
                          ? 'bg-amber-50 text-amber-900 hover:bg-amber-100'
                          : 'hover:bg-slate-50'
                    } ${day.isCurrentMonth ? '' : 'text-slate-300'}`}
                    title={
                      appointmentCount > 0
                        ? `${appointmentCount} booked appointment${
                            appointmentCount === 1 ? '' : 's'
                          }`
                        : 'No booked appointments'
                    }
                  >
                    {day.dayNumber}
                    {appointmentCount > 0 && (
                      <span
                        className={`absolute bottom-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${
                          isSelected ? 'bg-white' : 'bg-amber-500'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {scheduleLoading ? (
            <p className="text-sm text-slate-500">Loading schedule...</p>
          ) : (
            <>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-teal-600" />
                  <h4 className="font-semibold text-slate-900">
                    Time slots
                  </h4>
                </div>

                {associateScheduleSlots.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {associateScheduleSlots.slice(0, 32).map((slot) => {
                      const isSelected = selectedAssociateSlotStarts.includes(
                        slot.start
                      );

                      return (
                        <button
                          key={`${slot.start}-${slot.end}`}
                          type="button"
                          onClick={() => toggleAssociateScheduleSlot(slot)}
                          disabled={slot.isBooked}
                          className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                            slot.isBooked
                              ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                              : isSelected
                                ? 'border-teal-600 bg-teal-600 text-white hover:bg-teal-700'
                                : 'border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100'
                          }`}
                          title={
                            slot.isBooked
                              ? 'Already booked'
                              : isSelected
                                ? 'Deselect this time'
                                : 'Select this time'
                          }
                        >
                          {formatTime(slot.start)} - {formatTime(slot.end)}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    No slots found for the selected duration on this date.
                  </div>
                )}

                {selectedAssociateTimeRange && (
                  <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">
                    Selected:{' '}
                    <span className="font-semibold">
                      {formatTime(selectedAssociateTimeRange.start)} -{' '}
                      {formatTime(selectedAssociateTimeRange.end)}
                    </span>
                  </div>
                )}

                <div className="mt-3 flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setSelectedAssociateSlotStarts([])}
                    disabled={selectedAssociateSlotStarts.length === 0}
                  >
                    Clear Selection
                  </Button>
                  <Button
                    onClick={applyAssociateScheduleSelection}
                    disabled={!selectedAssociateTimeRange}
                  >
                    Apply Selected Time
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">
                    Availability
                  </h4>
                  <div className="space-y-2">
                    {scheduleAvailability
                      .filter(
                        (item) =>
                          item.is_active &&
                          item.day_of_week === getDayOfWeek(form.appointment_date)
                      )
                      .map((item) => (
                        <div
                          key={item.id}
                          className="rounded-lg border border-slate-200 p-3 text-sm text-slate-700"
                        >
                          {formatTime(item.start_time)} - {formatTime(item.end_time)}
                        </div>
                      ))}

                    {scheduleAvailability.filter(
                      (item) =>
                        item.is_active &&
                        item.day_of_week === getDayOfWeek(form.appointment_date)
                    ).length === 0 && (
                      <p className="rounded-lg border border-slate-200 p-3 text-sm text-slate-500">
                        No availability set for this date.
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-slate-900 mb-2">
                    Booked appointments
                  </h4>
                  <div className="space-y-2">
                    {sortedScheduleAppointments.map((appointment) => (
                      <div
                        key={appointment.id}
                        className="rounded-lg border border-slate-200 p-3 text-sm"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-slate-900">
                            {formatTime(appointment.start_time)} -{' '}
                            {formatTime(appointment.end_time)}
                          </p>
                          <span className="text-xs text-slate-500">
                            {appointment.status}
                          </span>
                        </div>
                        <p className="text-slate-600">
                          {appointment.client_name || 'Client'} |{' '}
                          {appointment.service_name || 'Service'}
                        </p>
                      </div>
                    ))}

                    {sortedScheduleAppointments.length === 0 && (
                      <p className="rounded-lg border border-slate-200 p-3 text-sm text-slate-500">
                        No appointments booked for this associate on this date.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={showRoomSchedule}
        onClose={() => setShowRoomSchedule(false)}
        title="Room Schedule"
        size="lg"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="md:col-span-2">
              <p className="text-xs text-slate-500">Room</p>
              <p className="font-medium text-slate-900">
                {selectedRoom?.room_name || 'Selected room'}
              </p>
            </div>

            <Input
              type="date"
              label="Date"
              value={form.appointment_date}
              onChange={(event) =>
                setForm({ ...form, appointment_date: event.target.value })
              }
            />
          </div>

          {roomScheduleLoading ? (
            <p className="text-sm text-slate-500">Loading room schedule...</p>
          ) : (
            <>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-teal-600" />
                  <h4 className="font-semibold text-slate-900">
                    Time slots
                  </h4>
                </div>

                {roomScheduleSlots.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                    {roomScheduleSlots.slice(0, 40).map((slot) => (
                      <button
                        key={`${slot.start}-${slot.end}`}
                        type="button"
                        onClick={() => pickScheduleSlot(slot)}
                        disabled={slot.isBooked}
                        className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                          slot.isBooked
                            ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                            : 'border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100'
                        }`}
                        title={slot.isBooked ? 'Already booked' : 'Pick this time'}
                      >
                        {formatTime(slot.start)} - {formatTime(slot.end)}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    No room slots found for the selected duration on this date.
                  </div>
                )}
              </div>

              <div>
                <h4 className="font-semibold text-slate-900 mb-2">
                  Booked appointments
                </h4>
                <div className="space-y-2">
                  {sortedRoomScheduleAppointments.map((appointment) => (
                    <div
                      key={appointment.id}
                      className="rounded-lg border border-slate-200 p-3 text-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-slate-900">
                          {formatTime(appointment.start_time)} -{' '}
                          {formatTime(appointment.end_time)}
                        </p>
                        <span className="text-xs text-slate-500">
                          {appointment.status}
                        </span>
                      </div>
                      <p className="text-slate-600">
                        {appointment.client_name || 'Client'} |{' '}
                        {appointment.service_name || 'Service'} |{' '}
                        {appointment.associate_name || 'Associate'}
                      </p>
                    </div>
                  ))}

                  {sortedRoomScheduleAppointments.length === 0 && (
                    <p className="rounded-lg border border-slate-200 p-3 text-sm text-slate-500">
                      No appointments booked for this room on this date.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
};
