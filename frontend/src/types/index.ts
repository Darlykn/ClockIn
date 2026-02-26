export type UserRole = 'admin' | 'manager' | 'employee';

export interface User {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  has_2fa: boolean;
  email?: string | null;
  employee_id?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResponse {
  requires_2fa_setup?: boolean;
  requires_2fa_verify?: boolean;
  temp_token?: string;
  access_token?: string;
  token_type?: string;
}

export interface Setup2FAResponse {
  qr_code_uri: string;
  secret: string;
}

export interface Verify2FAResponse {
  access_token: string;
  token_type: string;
}

export interface StatsSummary {
  attendance_pct: number;
  avg_arrival_time: string | null;
  avg_departure_time: string | null;
  late_count: number;
  overtime_count: number;
  avg_duration_hours: number | null;
  total_working_days: number;
  employee_id?: number;
}

export type DayStatus = 'normal' | 'late' | 'absent' | 'weekend';

export interface DailyStatus {
  date: string;
  status: DayStatus;
  first_entry?: string | null;
  last_entry?: string | null;
  checkpoint?: string | null;
}

export interface TrendPoint {
  month: string;
  attendance_pct: number;
  late_count: number;
}

export interface HeatmapPoint {
  day_of_week: number;
  hour: number;
  intensity: number;
}

export interface TopLateEmployee {
  employee_id: number;
  full_name: string;
  late_count: number;
}

export interface CheckpointStat {
  checkpoint: string;
  count: number;
}

export interface UploadResult {
  status: 'success' | 'partial' | 'failed';
  filename: string;
  total: number;
  inserted_count: number;
  skipped: number;
  error_count: number;
  errors: string[];
  /** Системные события СКУД (нет входа - идентификатора нет в бд и т.п.), не добавленные в БД */
  skipped_events: string[];
}

export interface ImportHistoryLogs {
  total: number;
  inserted: number;
  skipped: number;
  errors: string[];
  /** Системные события СКУД, пропущенные при импорте */
  skipped_events?: string[];
}

export interface ImportHistory {
  id: number;
  filename: string;
  uploaded_by: string;
  /** ФИО пользователя, загрузившего файл */
  uploaded_by_name?: string | null;
  uploaded_at: string;
  status: 'success' | 'partial' | 'failed';
  inserted_count: number;
  skipped: number;
  error_count: number;
  logs: ImportHistoryLogs;
}

export interface Employee {
  id: string;
  full_name: string;
}

export interface AttendanceLogEntry {
  event_time: string;
  event_type: 'entry' | 'exit';
  checkpoint: string;
}
