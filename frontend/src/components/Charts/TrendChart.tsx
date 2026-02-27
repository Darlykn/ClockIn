import { Paper, Text, Skeleton, Alert } from '@mantine/core';
import { useComputedColorScheme } from '@mantine/core';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useTrend } from '../../hooks/useStats';
import type { StatsParams } from '../../api/stats';

interface TrendChartProps {
  params: StatsParams;
}

export function TrendChart({ params }: TrendChartProps) {
  const { data, isLoading, isError, refetch } = useTrend({
    ...params,
    months: 12,
  });
  const colorScheme = useComputedColorScheme('light');
  const isDark = colorScheme === 'dark';

  const textColor = isDark ? '#666666' : '#6B6B6F';
  const gridColor = isDark ? '#2A2A2A' : '#E2E2E2';
  const tooltipBg = isDark ? '#222222' : '#FFFFFF';
  const tooltipText = isDark ? '#E0E0E0' : '#2C2C2E';

  if (isLoading) return <Skeleton height={280} radius="md" />;
  if (isError)
    return (
      <Alert color="red" onClick={() => refetch()} style={{ cursor: 'pointer' }}>
        Ошибка загрузки тренда. Нажмите для повтора.
      </Alert>
    );
  if (!data || data.length === 0)
    return (
      <Paper p="xl" withBorder ta="center">
        <Text c="dimmed">Нет данных за выбранный период</Text>
      </Paper>
    );

  return (
    <Paper p="md" withBorder radius="md">
      <Text fw={600} mb="md">
        Тренд посещаемости по месяцам
      </Text>
      <div className="chart-no-selection" style={{ outline: 'none', userSelect: 'none' }} onMouseDown={(e) => { const t = e.target as Element; if (t.closest('svg')) e.preventDefault(); }}>
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis dataKey="month" tick={{ fill: textColor, fontSize: 12 }} />
          <YAxis
            domain={[0, 100]}
            unit="%"
            tick={{ fill: textColor, fontSize: 12 }}
          />
          <Tooltip
            formatter={(value) => [`${(value as number).toFixed(1)}%`, 'Посещаемость']}
            contentStyle={{
              background: tooltipBg,
              border: `1px solid ${gridColor}`,
              borderRadius: 8,
              color: tooltipText,
              boxShadow: isDark
                ? '0 4px 16px rgba(0,0,0,0.4)'
                : '0 4px 16px rgba(0,0,0,0.12)',
            }}
          />
          <Legend />
          <Line
            type="monotone"
            dataKey="attendance_pct"
            name="% посещаемости"
            stroke='#00B0FF'
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
      </div>
    </Paper>
  );
}
