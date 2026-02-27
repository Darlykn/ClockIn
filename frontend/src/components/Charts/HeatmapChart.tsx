import { Paper, Text, Skeleton, Alert } from '@mantine/core';
import { useComputedColorScheme } from '@mantine/core';
import ReactECharts from 'echarts-for-react';
import { useHeatmap } from '../../hooks/useStats';
import type { StatsParams } from '../../api/stats';

// Порядок с понедельника (бэкенд: 0=Вс, 1=Пн, … 6=Сб)
const DAY_NAMES = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
/** Преобразуем day_of_week (0=Вс..6=Сб) в индекс по порядку Пн..Вс */
const toDisplayDay = (dow: number) => (dow + 6) % 7;

interface HeatmapChartProps {
  params: StatsParams;
}

export function HeatmapChart({ params }: HeatmapChartProps) {
  const { data, isLoading, isError, refetch } = useHeatmap(params);
  const colorScheme = useComputedColorScheme('light');
  const isDark = colorScheme === 'dark';

  const textColor = isDark ? '#666666' : '#6B6B6F';

  if (isLoading) return <Skeleton height={280} radius="md" />;
  if (isError)
    return (
      <Alert color="red" onClick={() => refetch()} style={{ cursor: 'pointer' }}>
        Ошибка загрузки тепловой карты. Нажмите для повтора.
      </Alert>
    );
  if (!data || data.length === 0)
    return (
      <Paper p="xl" withBorder ta="center">
        <Text c="dimmed">Нет данных за выбранный период</Text>
      </Paper>
    );

  const maxIntensity = Math.max(...data.map((d) => d.intensity), 1);
  const seriesData = data.map((d) => [d.hour, toDisplayDay(d.day_of_week), d.intensity]);

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      position: 'top',
      formatter: (params: { value: number[] }) => {
        const [hour, displayDayIndex, count] = params.value;
        return `${DAY_NAMES[displayDayIndex]}, ${String(hour).padStart(2, '0')}:00 — ${count} проходов`;
      },
      backgroundColor: isDark ? '#222222' : '#FFFFFF',
      borderColor: isDark ? '#2A2A2A' : '#E2E2E2',
      textStyle: { color: isDark ? '#E0E0E0' : '#2C2C2E' },
      borderRadius: 8,
      extraCssText: isDark
        ? 'box-shadow: 0 4px 16px rgba(0,0,0,0.4);'
        : 'box-shadow: 0 4px 16px rgba(0,0,0,0.12);',
    },
    grid: { height: '70%', top: '10%', left: '10%', right: '18%' },
    xAxis: {
      type: 'category',
      data: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`),
      splitArea: { show: true },
      axisLabel: {
        color: textColor,
        fontSize: 10,
        interval: 2,
      },
    },
    yAxis: {
      type: 'category',
      data: DAY_NAMES,
      splitArea: { show: true },
      axisLabel: { color: textColor },
    },
    visualMap: {
      min: 0,
      max: maxIntensity,
      calculable: true,
      orient: 'vertical',
      right: '2%',
      top: 'center',
      inRange: {
        color: isDark
          ? ['#1A1A1A', '#00B0FF', '#18FFFF']
          : ['#EFF6FF', '#40CAFF', '#00B0FF'],
      },
      textStyle: { color: textColor },
    },
    series: [
      {
        name: 'Проходы',
        type: 'heatmap',
        data: seriesData,
        label: { show: false },
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' },
        },
      },
    ],
  };

  return (
    <Paper p="md" withBorder radius="md">
      <Text fw={600} mb="md">
        Тепловая карта проходов
      </Text>
      <ReactECharts
        option={option}
        style={{ height: 240 }}
        theme={isDark ? 'dark' : undefined}
      />
    </Paper>
  );
}
