import { Paper, Text, Skeleton, Alert } from '@mantine/core';
import { useComputedColorScheme } from '@mantine/core';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useCheckpoints } from '../../hooks/useStats';
import type { StatsParams } from '../../api/stats';

// Vibrant palette
const CHART_COLORS = [
  '#FF5252',  // watermelon red
  '#40CAFF',  // bubblegum blue
  '#FFAB40',  // peachy orange
  '#00E676',  // mint green
  '#FFD600',  // pineapple yellow
  '#00B0FF',  // blue raspberry
  '#FF9100',  // tangerine orange
  '#18FFFF',  // aqua blue
  '#76FF03',  // apple green
  '#FFEA00',  // lemon yellow
];

interface CheckpointChartProps {
  params: StatsParams;
}

/** Сокращает длинное название точки до вида "...8000" (например "3-1 NC-8000"). */
function shortenCheckpointName(name: string): string {
  const idx = name.indexOf('8000');
  if (idx !== -1) return name.slice(0, idx + 4).trim();
  return name.length > 30 ? name.slice(0, 30) + '…' : name;
}

export function CheckpointChart({ params }: CheckpointChartProps) {
  const { data, isLoading, isError, refetch } = useCheckpoints(params);
  const colorScheme = useComputedColorScheme('light');
  const isDark = colorScheme === 'dark';

  const textColor = isDark ? '#666666' : '#6B6B6F';
  const tooltipBg = isDark ? '#222222' : '#FFFFFF';
  const tooltipText = isDark ? '#E0E0E0' : '#2C2C2E';
  const tooltipMuted = isDark ? '#999999' : '#6B6B6F';
  const borderColor = isDark ? '#2A2A2A' : '#E2E2E2';

  if (isLoading) return <Skeleton height={320} radius="md" />;
  if (isError)
    return (
      <Alert color="red" onClick={() => refetch()} style={{ cursor: 'pointer' }}>
        Ошибка загрузки точек прохода. Нажмите для повтора.
      </Alert>
    );
  if (!data || data.length === 0)
    return (
      <Paper p="xl" withBorder ta="center">
        <Text c="dimmed">Нет данных о точках прохода</Text>
      </Paper>
    );

  const total = data.reduce((sum, d) => sum + d.count, 0);
  const chartData = data.map((d) => ({
    name: d.checkpoint,
    shortName: shortenCheckpointName(d.checkpoint),
    value: d.count,
    pct: total > 0 ? ((d.count / total) * 100).toFixed(1) : '0',
  }));

  return (
    <Paper p="md" withBorder radius="md" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <Text fw={600} mb="md">
        Распределение по точкам прохода
      </Text>
      <div
        className="chart-no-selection"
        style={{ flex: 1, minHeight: 320, outline: 'none', userSelect: 'none' }}
        onMouseDown={(e) => { const t = e.target as Element; if (t.closest('svg')) e.preventDefault(); }}
      >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="shortName"
            cx="50%"
            cy="50%"
            outerRadius={115}
            stroke="none"
          >
            {chartData.map((_, index) => (
              <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const entry = payload[0].payload as {
                shortName: string;
                value: number;
                pct: string;
              };
              const color = payload[0].fill as string;
              return (
                <div
                  style={{
                    background: tooltipBg,
                    border: `1px solid ${borderColor}`,
                    borderRadius: 8,
                    padding: '10px 14px',
                    boxShadow: isDark
                      ? '0 4px 16px rgba(0,0,0,0.4)'
                      : '0 4px 16px rgba(0,0,0,0.12)',
                    minWidth: 160,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: color,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: 13,
                        color: tooltipText,
                      }}
                    >
                      {entry.shortName}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                    <span style={{ fontSize: 12, color: tooltipMuted }}>
                      Проходов
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: tooltipText }}>
                      {entry.value}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                    <span style={{ fontSize: 12, color: tooltipMuted }}>
                      Доля
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 600, color }}>
                      {entry.pct}%
                    </span>
                  </div>
                </div>
              );
            }}
          />
          <Legend
            layout="horizontal"
            align="center"
            verticalAlign="bottom"
            wrapperStyle={{ paddingTop: 12 }}
            formatter={(value) => (
              <span style={{ color: textColor, fontSize: 11 }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
      </div>
    </Paper>
  );
}
