export type AppointmentStatus =
  | 'Scheduled'
  | 'Confirmed'
  | 'Completed'
  | 'Cancelled'
  | 'No Show'
  | 'Rescheduled';

export type AppointmentType = 'In-person' | 'Online' | 'Hybrid';

export type AppointmentPaymentStatus = 'Unpaid' | 'Partial' | 'Paid' | 'Waived';

export type AssociateSkillLevel = 'qualified' | 'preferred' | 'specialist';

export interface Room {
  id: string;
  room_name: string;
  room_type: string | null;
  capacity: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface AssociateAvailability {
  id: string;
  associate_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
  created_at: string;
}

export interface AssociateService {
  id: string;
  associate_id: string;
  service_id: string;
  is_preferred: boolean;
  skill_level: AssociateSkillLevel;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  service_name?: string;
  associate_name?: string;
}

export interface Appointment {
  id: string;
  client_id: string;
  service_id: string;
  associate_id: string;
  referral_id: string | null;
  room_id: string | null;
  transaction_id: string | null;
  transaction_item_id: string | null;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  appointment_type: AppointmentType;
  payment_status: AppointmentPaymentStatus;
  amount_due: number;
  amount_paid: number;
  notes: string | null;
  cancellation_reason: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  client_name?: string;
  service_name?: string;
  service_price?: number;
  associate_name?: string;
  referral_name?: string;
  room_name?: string;
}

export interface AppointmentPayload {
  client_id: string;
  service_id: string;
  associate_id: string;
  referral_id?: string | null;
  room_id?: string | null;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  appointment_type: AppointmentType;
  payment_status: AppointmentPaymentStatus;
  amount_due: number;
  amount_paid?: number;
  notes?: string | null;
  cancellation_reason?: string | null;
  created_by_user_id?: string | null;
}

export interface ConflictCheckResult {
  valid: boolean;
  messages: string[];
}

export interface RecommendationRequest {
  serviceId: string;
  appointmentDate: string;
  startTime: string;
  endTime: string;
  appointmentType?: AppointmentType;
  excludeAppointmentId?: string;
}

export interface AssociateRecommendation {
  associate_id: string;
  associate_name: string;
  title?: string;
  skill_level?: AssociateSkillLevel;
  is_preferred: boolean;
  workload: number;
  score: number;
  is_available: boolean;
  has_conflict: boolean;
  tagged_for_service: boolean;
  warning?: string;
}
