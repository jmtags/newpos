import { supabase } from '../lib/supabaseClient';
import type {
  AppointmentType,
  AssociateRecommendation,
  RecommendationRequest,
  Room
} from './scheduling.types';

const skillRank: Record<string, number> = {
  specialist: 3,
  preferred: 2,
  qualified: 1
};

export const toMinutes = (time: string) => {
  const [hours, minutes] = time.slice(0, 5).split(':').map(Number);
  return hours * 60 + minutes;
};

export const rangesOverlap = (
  startA: string,
  endA: string,
  startB: string,
  endB: string
) => toMinutes(startA) < toMinutes(endB) && toMinutes(endA) > toMinutes(startB);

export const getDayOfWeek = (dateValue: string) =>
  new Date(`${dateValue}T00:00:00`).getDay();

export const schedulingRecommendationService = {
  async getRecommendedAssociates({
    serviceId,
    appointmentDate,
    startTime,
    endTime,
    excludeAppointmentId
  }: RecommendationRequest): Promise<AssociateRecommendation[]> {
    if (!serviceId || !appointmentDate || !startTime || !endTime) return [];

    const dayOfWeek = getDayOfWeek(appointmentDate);

    const [associatesResult, tagsResult, availabilityResult, appointmentsResult] =
      await Promise.all([
        supabase
          .from('mental_health_associates')
          .select('*')
          .eq('is_active', true),
        supabase
          .from('associate_services')
          .select('*')
          .eq('service_id', serviceId)
          .eq('is_active', true),
        supabase
          .from('associate_availability')
          .select('*')
          .eq('day_of_week', dayOfWeek)
          .eq('is_active', true),
        supabase
          .from('appointments')
          .select('id, associate_id, appointment_date, start_time, end_time, status')
          .eq('appointment_date', appointmentDate)
          .neq('status', 'Cancelled')
      ]);

    if (associatesResult.error) throw associatesResult.error;
    if (tagsResult.error) throw tagsResult.error;
    if (availabilityResult.error) throw availabilityResult.error;
    if (appointmentsResult.error) throw appointmentsResult.error;

    const tags = tagsResult.data || [];
    const availability = availabilityResult.data || [];
    const appointments = (appointmentsResult.data || []).filter(
      (appointment: any) => appointment.id !== excludeAppointmentId
    );

    return (associatesResult.data || [])
      .map((associate: any) => {
        const tag = tags.find((item: any) => item.associate_id === associate.id);
        const availabilityRows = availability.filter(
          (item: any) => item.associate_id === associate.id
        );
        const isAvailable = availabilityRows.some(
          (item: any) =>
            toMinutes(item.start_time) <= toMinutes(startTime) &&
            toMinutes(item.end_time) >= toMinutes(endTime)
        );
        const sameDayAppointments = appointments.filter(
          (appointment: any) => appointment.associate_id === associate.id
        );
        const hasConflict = sameDayAppointments.some((appointment: any) =>
          rangesOverlap(startTime, endTime, appointment.start_time, appointment.end_time)
        );
        const workload = sameDayAppointments.length;
        const taggedForService = Boolean(tag);
        const score =
          (taggedForService ? 100 : 0) +
          (isAvailable ? 40 : 0) +
          (!hasConflict ? 30 : -100) +
          (tag?.is_preferred ? 20 : 0) +
          (skillRank[tag?.skill_level || ''] || 0) * 10 -
          workload;

        return {
          associate_id: associate.id,
          associate_name: associate.full_name,
          title: associate.title || '',
          skill_level: tag?.skill_level,
          is_preferred: Boolean(tag?.is_preferred),
          workload,
          score,
          is_available: isAvailable,
          has_conflict: hasConflict,
          tagged_for_service: taggedForService,
          warning: taggedForService
            ? undefined
            : 'This associate is not currently tagged as preferred/qualified for this service. You may still proceed.'
        };
      })
      .sort((a, b) => b.score - a.score);
  },

  async getAvailableRooms({
    appointmentDate,
    startTime,
    endTime,
    appointmentType = 'In-person',
    excludeAppointmentId
  }: {
    appointmentDate: string;
    startTime: string;
    endTime: string;
    appointmentType?: AppointmentType;
    excludeAppointmentId?: string;
  }): Promise<Room[]> {
    if (!appointmentDate || !startTime || !endTime) return [];

    const [roomsResult, appointmentsResult] = await Promise.all([
      supabase
        .from('rooms')
        .select('*')
        .eq('is_active', true)
        .order('room_name', { ascending: true }),
      supabase
        .from('appointments')
        .select('id, room_id, appointment_date, start_time, end_time, status')
        .eq('appointment_date', appointmentDate)
        .neq('status', 'Cancelled')
    ]);

    if (roomsResult.error) throw roomsResult.error;
    if (appointmentsResult.error) throw appointmentsResult.error;

    const blockingAppointments = (appointmentsResult.data || []).filter(
      (appointment: any) =>
        appointment.id !== excludeAppointmentId &&
        appointment.room_id &&
        rangesOverlap(startTime, endTime, appointment.start_time, appointment.end_time)
    );

    const blockedRoomIds = new Set(
      blockingAppointments.map((appointment: any) => appointment.room_id)
    );

    return (roomsResult.data || [])
      .filter((room: any) => {
        if (blockedRoomIds.has(room.id)) return false;
        if (appointmentType === 'Online') {
          return room.room_name === 'Online Session' || room.room_type === 'Online';
        }
        return true;
      })
      .map((room: any) => ({
        ...room,
        capacity: Number(room.capacity || 1)
      }));
  }
};
