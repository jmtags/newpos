import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  List,
  Plus
} from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Input } from '../components/Input';
import { Select } from '../components/Select';
import { AppointmentStatusBadge } from '../components/scheduling/AppointmentStatusBadge';
import { associateService } from '../services/associateService';
import { roomService } from '../services/room.service';
import { appointmentService } from '../services/appointment.service';
import { useAppContext } from '../context/AppContext';
import type { Appointment } from '../services/scheduling.types';

export type CalendarViewMode = 'month' | 'day';

export interface SchedulingCalendarFilters {
  date: string;
  month: string;
  associateId: string;
  roomId: string;
  status: string;
  serviceId: string;
}

export interface SchedulingCalendarState {
  viewMode: CalendarViewMode;
  filters: SchedulingCalendarFilters;
}

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const toDateInputValue = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const today = () => toDateInputValue(new Date());

const parseDateInput = (dateValue: string) => new Date(`${dateValue}T00:00:00`);

const toMonthInputValue = (dateValue: string) => dateValue.slice(0, 7);

const getMonthRange = (monthValue: string) => {
  const [year, month] = monthValue.split('-').map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);

  return {
    start,
    end,
    startDate: toDateInputValue(start),
    endDate: toDateInputValue(end)
  };
};

const buildMonthGrid = (monthValue: string, selectedDate: string) => {
  const [year, month] = monthValue.split('-').map(Number);
  const firstOfMonth = new Date(year, month - 1, 1);
  const gridStart = new Date(firstOfMonth);
  gridStart.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const dateKey = toDateInputValue(date);

    return {
      date,
      dateKey,
      dayNumber: date.getDate(),
      isCurrentMonth: date.getMonth() === month - 1,
      isToday: dateKey === today(),
      isSelected: dateKey === selectedDate
    };
  });
};

const formatMonthTitle = (monthValue: string) => {
  const [year, month] = monthValue.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric'
  });
};

const moveMonth = (monthValue: string, amount: number) => {
  const [year, month] = monthValue.split('-').map(Number);
  return toDateInputValue(new Date(year, month - 1 + amount, 1)).slice(0, 7);
};

const moveDay = (dateValue: string, amount: number) => {
  const date = parseDateInput(dateValue);
  date.setDate(date.getDate() + amount);
  return toDateInputValue(date);
};

interface SchedulingCalendarProps {
  initialState?: SchedulingCalendarState;
  onStateChange?: (state: SchedulingCalendarState) => void;
  onCreate: (state: SchedulingCalendarState) => void;
  onView: (appointmentId: string, state: SchedulingCalendarState) => void;
}

export const SchedulingCalendar: React.FC<SchedulingCalendarProps> = ({
  initialState,
  onStateChange,
  onCreate,
  onView
}) => {
  const { services } = useAppContext();
  const [viewMode, setViewMode] = useState<CalendarViewMode>(
    initialState?.viewMode || 'month'
  );
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [associates, setAssociates] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [filters, setFilters] = useState<SchedulingCalendarFilters>(
    initialState?.filters || {
    date: today(),
    month: toMonthInputValue(today()),
    associateId: '',
    roomId: '',
    status: '',
    serviceId: ''
  });

  const calendarState = useMemo(
    () => ({ viewMode, filters }),
    [viewMode, filters]
  );

  const loadData = async () => {
    const monthRange = getMonthRange(filters.month);
    const appointmentFilters =
      viewMode === 'month'
        ? {
            startDate: monthRange.startDate,
            endDate: monthRange.endDate
          }
        : { date: filters.date };

    const [appointmentData, associateData, roomData] = await Promise.all([
      appointmentService.getAppointments({
        ...appointmentFilters,
        associateId: filters.associateId || undefined,
        roomId: filters.roomId || undefined,
        serviceId: filters.serviceId || undefined,
        status: filters.status || undefined
      }),
      associateService.getAssociates(),
      roomService.getRooms(false)
    ]);

    setAppointments(appointmentData);
    setAssociates(associateData.filter((associate: any) => associate.is_active));
    setRooms(roomData);
  };

  useEffect(() => {
    loadData();
  }, [filters, viewMode]);

  useEffect(() => {
    onStateChange?.(calendarState);
  }, [calendarState, onStateChange]);

  const appointmentsByDate = useMemo(() => {
    return appointments.reduce<Record<string, Appointment[]>>((grouped, appointment) => {
      if (!grouped[appointment.appointment_date]) {
        grouped[appointment.appointment_date] = [];
      }

      grouped[appointment.appointment_date].push(appointment);
      grouped[appointment.appointment_date].sort((a, b) =>
        a.start_time.localeCompare(b.start_time)
      );

      return grouped;
    }, {});
  }, [appointments]);

  const monthGridDays = useMemo(
    () => buildMonthGrid(filters.month, filters.date),
    [filters.month, filters.date]
  );

  const sortedDailyAppointments = useMemo(
    () =>
      [...appointments].sort((a, b) =>
        `${a.appointment_date} ${a.start_time}`.localeCompare(
          `${b.appointment_date} ${b.start_time}`
        )
      ),
    [appointments]
  );

  const selectedDateAppointments = appointmentsByDate[filters.date] || [];

  const updateDate = (dateValue: string) => {
    setFilters({
      ...filters,
      date: dateValue,
      month: toMonthInputValue(dateValue)
    });
  };

  const openDailyViewForDate = (dateValue: string) => {
    setFilters({
      ...filters,
      date: dateValue,
      month: toMonthInputValue(dateValue)
    });
    setViewMode('day');
  };

  const updateMonth = (monthValue: string) => {
    const nextDate = `${monthValue}-01`;
    setFilters({
      ...filters,
      month: monthValue,
      date: nextDate
    });
  };

  const goToToday = () => {
    const todayValue = today();
    setFilters({
      ...filters,
      date: todayValue,
      month: toMonthInputValue(todayValue)
    });
  };

  const goPrevious = () => {
    if (viewMode === 'month') {
      const previousMonth = moveMonth(filters.month, -1);
      updateMonth(previousMonth);
      return;
    }

    updateDate(moveDay(filters.date, -1));
  };

  const goNext = () => {
    if (viewMode === 'month') {
      const nextMonth = moveMonth(filters.month, 1);
      updateMonth(nextMonth);
      return;
    }

    updateDate(moveDay(filters.date, 1));
  };

  const renderAppointmentPreview = (appointment: Appointment) => (
    <button
      key={appointment.id}
      onClick={(event) => {
        event.stopPropagation();
        onView(appointment.id, calendarState);
      }}
      className="w-full rounded-md bg-teal-50 text-left px-2 py-1 text-xs text-teal-900 hover:bg-teal-100"
      title={`${appointment.start_time.slice(0, 5)} ${appointment.client_name}`}
    >
      <span className="font-semibold">{appointment.start_time.slice(0, 5)}</span>{' '}
      <span className="truncate">{appointment.client_name}</span>
    </button>
  );

  const renderDailyAppointment = (appointment: Appointment) => (
    <button
      key={appointment.id}
      onClick={() => onView(appointment.id, calendarState)}
      className="w-full text-left rounded-lg border border-slate-200 bg-white hover:bg-slate-50 p-4 transition-colors"
    >
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">
            {appointment.start_time.slice(0, 5)} - {appointment.end_time.slice(0, 5)}
          </p>
          <p className="text-sm text-slate-600">
            {appointment.client_name} - {appointment.service_name}
          </p>
          <p className="text-xs text-slate-500">
            {appointment.associate_name} - {appointment.room_name || appointment.appointment_type}
          </p>
          {appointment.referral_name && (
            <p className="text-xs text-slate-500">
              Referral: {appointment.referral_name}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <AppointmentStatusBadge status={appointment.status} />
          <AppointmentStatusBadge paymentStatus={appointment.payment_status} />
        </div>
      </div>
    </button>
  );

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col lg:flex-row gap-4 lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">
            Scheduling Calendar
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            View appointments by month or by day with associate, room, status, and service filters.
          </p>
        </div>

        <Button onClick={() => onCreate(calendarState)}>
          <Plus className="w-4 h-4 mr-2" />
          New Appointment
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-col xl:flex-row gap-4 xl:items-end xl:justify-between">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 flex-1">
            {viewMode === 'month' ? (
              <Input
                type="month"
                label="Month"
                value={filters.month}
                onChange={(event) => updateMonth(event.target.value)}
              />
            ) : (
              <Input
                type="date"
                label="Date"
                value={filters.date}
                onChange={(event) => updateDate(event.target.value)}
              />
            )}

            <Select
              label="Associate"
              value={filters.associateId}
              onChange={(event) =>
                setFilters({ ...filters, associateId: event.target.value })
              }
              options={[
                { value: '', label: 'All associates' },
                ...associates.map((associate) => ({
                  value: associate.id,
                  label: associate.full_name
                }))
              ]}
            />

            <Select
              label="Room"
              value={filters.roomId}
              onChange={(event) =>
                setFilters({ ...filters, roomId: event.target.value })
              }
              options={[
                { value: '', label: 'All rooms' },
                ...rooms.map((room) => ({ value: room.id, label: room.room_name }))
              ]}
            />

            <Select
              label="Status"
              value={filters.status}
              onChange={(event) =>
                setFilters({ ...filters, status: event.target.value })
              }
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

            <Select
              label="Service"
              value={filters.serviceId}
              onChange={(event) =>
                setFilters({ ...filters, serviceId: event.target.value })
              }
              options={[
                { value: '', label: 'All services' },
                ...services.map((service) => ({
                  value: service.id,
                  label: service.name
                }))
              ]}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1">
              <button
                type="button"
                onClick={() => setViewMode('month')}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium ${
                  viewMode === 'month'
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <CalendarDays className="w-4 h-4" />
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setViewMode('day')}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium ${
                  viewMode === 'day'
                    ? 'bg-teal-600 text-white'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <List className="w-4 h-4" />
                Daily
              </button>
            </div>

            <Button variant="outline" onClick={goPrevious}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" onClick={goToToday}>
              Today
            </Button>
            <Button variant="outline" onClick={goNext}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>

      {viewMode === 'month' ? (
        <Card className="overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 p-4 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <CalendarDays className="w-6 h-6 text-teal-600" />
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  {formatMonthTitle(filters.month)}
                </h3>
                <p className="text-sm text-slate-500">
                  {appointments.length} appointment{appointments.length === 1 ? '' : 's'} this month
                </p>
              </div>
            </div>

            <div className="text-sm text-slate-500">
              Selected: {parseDateInput(filters.date).toLocaleDateString()}
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
            {dayLabels.map((day) => (
              <div
                key={day}
                className="px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-7">
            {monthGridDays.map((day) => {
              const dayAppointments = appointmentsByDate[day.dateKey] || [];

              return (
                <button
                  key={day.dateKey}
                  type="button"
                  onClick={() => updateDate(day.dateKey)}
                  className={`min-h-36 border-b border-r border-slate-200 p-2 text-left transition-colors hover:bg-slate-50 ${
                    day.isSelected ? 'bg-teal-50' : 'bg-white'
                  } ${!day.isCurrentMonth ? 'text-slate-400 bg-slate-50/60' : ''}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium ${
                        day.isToday
                          ? 'bg-teal-600 text-white'
                          : day.isSelected
                          ? 'bg-teal-100 text-teal-800'
                          : 'text-slate-700'
                      }`}
                    >
                      {day.dayNumber}
                    </span>
                    {dayAppointments.length > 0 && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {dayAppointments.length}
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    {dayAppointments.slice(0, 3).map(renderAppointmentPreview)}
                    {dayAppointments.length > 3 && (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.stopPropagation();
                          openDailyViewForDate(day.dateKey);
                        }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          event.preventDefault();
                          event.stopPropagation();
                          openDailyViewForDate(day.dateKey);
                        }}
                        className="text-xs font-medium text-teal-700 hover:text-teal-900"
                      >
                        +{dayAppointments.length - 3} more
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="p-4 border-t border-slate-200 bg-slate-50">
            <h4 className="text-sm font-semibold text-slate-900 mb-3">
              Selected Day
            </h4>
            <div className="space-y-2">
              {selectedDateAppointments.map(renderDailyAppointment)}

              {selectedDateAppointments.length === 0 && (
                <p className="text-sm text-slate-500">
                  No appointments for the selected day.
                </p>
              )}
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-5">
            <CalendarDays className="w-6 h-6 text-teal-600" />
            <h3 className="text-lg font-semibold text-slate-900">
              {parseDateInput(filters.date).toLocaleDateString()}
            </h3>
          </div>

          <div className="space-y-3">
            {sortedDailyAppointments.map(renderDailyAppointment)}

            {sortedDailyAppointments.length === 0 && (
              <div className="py-12 text-center text-slate-500">
                No appointments scheduled for this filter.
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
};
