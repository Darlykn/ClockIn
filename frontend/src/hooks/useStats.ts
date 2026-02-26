import { useQuery } from '@tanstack/react-query';
import { statsApi, type StatsParams } from '../api/stats';

export function useSummary(params: StatsParams) {
  return useQuery({
    queryKey: ['stats', 'summary', params],
    queryFn: () => statsApi.getSummary(params),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCalendar(
  employeeId: string | undefined,
  year: number,
  month: number
) {
  return useQuery({
    queryKey: ['stats', 'calendar', employeeId, year, month],
    queryFn: () => statsApi.getCalendar(employeeId, year, month),
    enabled: year > 0 && month > 0,
  });
}

export function useTrend(params: StatsParams & { months?: number }) {
  return useQuery({
    queryKey: ['stats', 'trend', params],
    queryFn: () => statsApi.getTrend(params),
    staleTime: 5 * 60 * 1000,
  });
}

export function useHeatmap(params: StatsParams) {
  return useQuery({
    queryKey: ['stats', 'heatmap', params],
    queryFn: () => statsApi.getHeatmap(params),
    staleTime: 5 * 60 * 1000,
  });
}

export function useTopLate(params: StatsParams & { limit?: number }) {
  return useQuery({
    queryKey: ['stats', 'top-late', params],
    queryFn: () => statsApi.getTopLate(params),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCheckpoints(params: StatsParams) {
  return useQuery({
    queryKey: ['stats', 'checkpoints', params],
    queryFn: () => statsApi.getCheckpoints(params),
    staleTime: 5 * 60 * 1000,
  });
}
