import { useMemo } from 'react';
import { Paper, Text, Skeleton, Alert } from '@mantine/core';
import { useComputedColorScheme } from '@mantine/core';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { statsApi } from '../../api/stats';
import type { StatsParams } from '../../api/stats';

interface WorkHoursChartProps {
  params: StatsParams;
}

export function WorkHoursChart({ params }: WorkHoursChartProps) {
  const employeeId = params.employee_id;
  const {
    data: logs,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['employee-logs-chart', employeeId, params.date_from, params.date_to],
    queryFn: () =>
      statsApi.getEmployeeLogs(employeeId!, params.date_from, params.date_to),
    enabled: !!employeeId,
    staleTime: 5 * 60 * 1000,
  });

  const colorScheme = useComputedColorScheme('light');
  const isDark = colorScheme === 'dark';
  const textColor = isDark ? '#c1c2c5' : '#495057';
  const gridColor = isDark ? '#373a40' : '#dee2e6';

  const chartData = useMemo(() => {
    if (!logs || logs.length === 0) return [];

    // Group logs by date, find first entry and last exit
    const dailyMap = new Map<string, { firstEntry: dayjs.Dayjs | null; lastExit: dayjs.Dayjs | null }>();

    for (const log of logs) {
      const dateKey = dayjs(log.event_time).format('YYYY-MM-DD');
      const t = dayjs(log.event_time);
      const existing = dailyMap.get(dateKey) ?? { firstEntry: null, lastExit: null };

      if (log.event_type === 'entry') {
        if (!existing.firstEntry || t.isBefore(existing.firstEntry)) {
          existing.firstEntry = t;
        }
      } else {
        if (!existing.lastExit || t.isAfter(existing.lastExit)) {
          existing.lastExit = t;
        }
      }

      dailyMap.set(dateKey, existing);
    }

    return Array.from(dailyMap.entries())
      .map(([dateKey, { firstEntry, lastExit }]) => {
        const hours =
          firstEntry && lastExit
            ? lastExit.diff(firstEntry, 'hour', true)
            : 0;
        return {
          date: dayjs(dateKey).format('DD.MM'),
          fullDate: dayjs(dateKey).format('DD.MM.YYYY'),
          hours: Math.round(hours * 10) / 10,
          arrival: firstEntry?.format('HH:mm') ?? '—',
          departure: lastExit?.format('HH:mm') ?? '—',
        };
      })
      .sort((a, b) => a.fullDate.localeCompare(b.fullDate));
  }, [logs]);

  if (isLoading) return <Skeleton height={280} radius="md" />;
  if (isError)
    return (
      <Alert color="red" onClick={() => refetch()} style={{ cursor: 'pointer' }}>
        Ошибка загрузки данных. Нажмите для повтора.
      </Alert>
    );
  if (!chartData || chartData.length === 0)
    return (
      <Paper p="xl" withBorder ta="center">
        <Text c="dimmed">Нет данных о рабочих часах</Text>
      </Paper>
    );

  return (
    <Paper p="md" withBorder radius="md" style={{ flex: 1 }}>
      <Text fw={600} mb="md">
        Рабочие часы по дням
      </Text>
      <div
        className="chart-no-selection"
        style={{ outline: 'none', userSelect: 'none' }}
        onMouseDown={(e) => {
          const t = e.target as Element;
          if (t.closest('svg')) e.preventDefault();
        }}
      >
        <ResponsiveContainer width="100%" height={Math.max(200, 280)}>
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 40, left: 0, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              dataKey="date"
              tick={{ fill: textColor, fontSize: 11 }}
              interval={chartData.length > 15 ? Math.floor(chartData.length / 10) : 0}
            />
            <YAxis
              tick={{ fill: textColor, fontSize: 12 }}
              unit=" ч"
              domain={[0, 'auto']}
            />
            <ReferenceLine
              y={8}
              stroke="#40c057"
              strokeDasharray="5 5"
              label={{
                value: '8 ч',
                position: 'right',
                fill: '#40c057',
                fontSize: 11,
              }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const d = payload[0].payload as {
                  fullDate: string;
                  hours: number;
                  arrival: string;
                  departure: string;
                };
                return (
                  <div
                    style={{
                      background: isDark ? '#25262b' : '#fff',
                      border: `1px solid ${gridColor}`,
                      borderRadius: 8,
                      padding: '8px 12px',
                      color: textColor,
                      fontSize: 12,
                    }}
                  >
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.fullDate}</div>
                    <div>Приход: {d.arrival}</div>
                    <div>Уход: {d.departure}</div>
                    <div style={{ fontWeight: 600, marginTop: 4 }}>
                      Итого: {d.hours} ч
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="hours" radius={[4, 4, 0, 0]}>
              {chartData.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.hours >= 8 ? '#228be6' : d.hours >= 6 ? '#fab005' : '#fa5252'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Paper>
  );
}
