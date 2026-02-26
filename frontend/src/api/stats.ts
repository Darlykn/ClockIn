import api from './client';
import type {
  StatsSummary,
  DailyStatus,
  TrendPoint,
  HeatmapPoint,
  TopLateEmployee,
  CheckpointStat,
  AttendanceLogEntry,
} from '../types';

export interface StatsParams {
  employee_id?: string;
  date_from?: string;
  date_to?: string;
}

export const statsApi = {
  getSummary: (params: StatsParams) =>
    api.get<StatsSummary>('/stats/summary', { params }).then((r) => r.data),

  getCalendar: (employee_id: string | undefined, year: number, month: number) =>
    api
      .get<DailyStatus[]>('/stats/calendar', {
        params: { employee_id, year, month },
      })
      .then((r) => r.data),

  getTrend: (params: StatsParams & { months?: number }) =>
    api.get<TrendPoint[]>('/stats/trend', { params }).then((r) => r.data),

  getHeatmap: (params: StatsParams) =>
    api.get<HeatmapPoint[]>('/stats/heatmap', { params }).then((r) => r.data),

  getTopLate: (params: StatsParams & { limit?: number }) =>
    api
      .get<TopLateEmployee[]>('/stats/top-late', { params })
      .then((r) => r.data),

  getCheckpoints: (params: StatsParams) =>
    api
      .get<CheckpointStat[]>('/stats/checkpoints', { params })
      .then((r) => r.data),

  getEmployeeLogs: (employee_id: string, date_from?: string, date_to?: string) =>
    api
      .get<AttendanceLogEntry[]>('/stats/employee-logs', {
        params: { employee_id, date_from, date_to },
      })
      .then((r) => r.data),
};
