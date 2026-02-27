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
  Cell,
} from 'recharts';
import { useTopLate } from '../../hooks/useStats';
import type { StatsParams } from '../../api/stats';

interface TopLateChartProps {
  params: StatsParams;
  limit?: number;
}

export function TopLateChart({ params, limit = 10 }: TopLateChartProps) {
  const { data, isLoading, isError, refetch } = useTopLate({ ...params, limit });
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
        Ошибка загрузки рейтинга. Нажмите для повтора.
      </Alert>
    );
  if (!data || data.length === 0)
    return (
      <Paper p="xl" withBorder ta="center">
        <Text c="dimmed">Нет данных об опозданиях</Text>
      </Paper>
    );

  const chartData = [...data]
    .sort((a, b) => b.late_count - a.late_count)
    .map((d) => ({
      name: d.full_name,
      count: d.late_count,
    }));

  return (
    <Paper p="md" withBorder radius="md" style={{ flex: 1 }}>
      <Text fw={600} mb="md">
        Топ опаздывающих
      </Text>
      <div className="chart-no-selection" style={{ outline: 'none', userSelect: 'none' }} onMouseDown={(e) => { const t = e.target as Element; if (t.closest('svg')) e.preventDefault(); }}>
      <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 32)}>
        <BarChart
          layout="vertical"
          data={chartData}
          margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
          <XAxis
            type="number"
            tick={{ fill: textColor, fontSize: 12 }}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={240}
            interval={0}
            tick={{ fill: textColor, fontSize: 13 }}
            tickMargin={4}
          />
          <Tooltip
            formatter={(v) => [v as number, 'Опоздания']}
            contentStyle={{
              background: tooltipBg,
              border: `1px solid ${gridColor}`,
              borderRadius: 8,
              color: tooltipText,
              boxShadow: isDark
                ? '0 4px 16px rgba(0,0,0,0.4)'
                : '0 4px 16px rgba(0,0,0,0.12)',
            }}
            labelStyle={{ color: tooltipText }}
            itemStyle={{ color: tooltipText }}
          />
          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
            {chartData.map((_, index) => (
              <Cell
                key={index}
                fill={index === 0 ? '#FF5252' : index === 1 ? '#FFD600' : index === 2 ? '#00E676' : '#40CAFF'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      </div>
    </Paper>
  );
}
