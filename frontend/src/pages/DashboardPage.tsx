import { useState } from 'react';
import {
  Grid,
  Paper,
  Stack,
  Text,
  Title,
  Select,
  Group,
  SimpleGrid,
  Skeleton,
  Alert,
  ThemeIcon,
  Badge,
} from '@mantine/core';
import { DatePickerInput, type DatesRangeValue } from '@mantine/dates';
import {
  IconCalendarStats,
  IconClock,
  IconAlertTriangle,
  IconTrendingUp,
  IconUsers,
  IconClockHour4,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useSummary } from '../hooks/useStats';
import { useAuth } from '../providers/AuthProvider';
import { useEmployees } from '../hooks/useUsers';
import { TrendChart } from '../components/Charts/TrendChart';
import { HeatmapChart } from '../components/Charts/HeatmapChart';
import { TopLateChart } from '../components/Charts/TopLateChart';
import { CheckpointChart } from '../components/Charts/CheckpointChart';
import { YearCalendar } from '../components/Calendar/YearCalendar';
import type { StatsParams } from '../api/stats';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  loading?: boolean;
}

function StatsCard({ title, value, icon: Icon, color, loading }: StatsCardProps) {
  if (loading) return <Skeleton height={100} radius="md" />;
  return (
    <Paper p="md" withBorder radius="md">
      <Group justify="space-between" align="flex-start">
        <Stack gap={4}>
          <Text size="xs" c="dimmed" tt="uppercase" fw={600}>
            {title}
          </Text>
          <Title order={3}>{value}</Title>
        </Stack>
        <ThemeIcon size="lg" variant="light" color={color} radius="md">
          <Icon size={20} />
        </ThemeIcon>
      </Group>
    </Paper>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const { data: employees } = useEmployees();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  const STORAGE_KEY = 'AttendTrack-dashboard-period';

  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(
    isAdmin ? null : String(user?.employee_id ?? '')
  );
  const [dateFrom, setDateFrom] = useState<string>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return dayjs().startOf('month').format('YYYY-MM-DD');
      const parsed = JSON.parse(raw) as { dateFrom?: string; dateTo?: string };
      const from = parsed?.dateFrom ?? '';
      if (from && dayjs(from).isValid()) return from;
    } catch {
      // ignore
    }
    return dayjs().startOf('month').format('YYYY-MM-DD');
  });
  const [dateTo, setDateTo] = useState<string>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return dayjs().endOf('month').format('YYYY-MM-DD');
      const parsed = JSON.parse(raw) as { dateFrom?: string; dateTo?: string };
      const to = parsed?.dateTo ?? '';
      if (to && dayjs(to).isValid()) return to;
    } catch {
      // ignore
    }
    return dayjs().endOf('month').format('YYYY-MM-DD');
  });

  const params: StatsParams = {
    employee_id: selectedEmployee ?? undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  };

  const { data: summary, isLoading, isError } = useSummary(params);

  const employeeOptions = employees?.map((e) => ({
    value: String(e.id),
    label: e.full_name,
  })) ?? [];

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="flex-end">
        <Title order={2}>Статистика</Title>
        <Badge variant="light" size="lg">
          {dateFrom ? dayjs(dateFrom).format('MMM YYYY') : '—'}
        </Badge>
      </Group>

      <Paper p="md" withBorder radius="md">
        <Group gap="md" wrap="wrap">
          {isAdmin && (
            <Select
              label="Сотрудник"
              placeholder="Все сотрудники"
              data={employeeOptions}
              value={selectedEmployee}
              onChange={setSelectedEmployee}
              clearable
              searchable
              w={250}
            />
          )}
          <DatePickerInput
            type="range"
            label="Период"
            placeholder="Выберите период"
            value={[
              dateFrom ? new Date(dateFrom) : null,
              dateTo ? new Date(dateTo) : null,
            ]}
            onChange={(val: DatesRangeValue) => {
              const [from, to] = val;
              const fromStr = from ? dayjs(from).format('YYYY-MM-DD') : '';
              const toStr = to ? dayjs(to).format('YYYY-MM-DD') : '';
              setDateFrom(fromStr);
              setDateTo(toStr);
              if (fromStr && toStr) {
                try {
                  localStorage.setItem(
                    STORAGE_KEY,
                    JSON.stringify({ dateFrom: fromStr, dateTo: toStr })
                  );
                } catch {
                  // ignore
                }
              }
            }}
            w={280}
            valueFormat="DD.MM.YYYY"
          />
        </Group>
      </Paper>

      {isError && (
        <Alert color="red" icon={<IconAlertTriangle size={16} />}>
          Ошибка загрузки данных. Проверьте подключение к серверу.
        </Alert>
      )}

      {!isError && !isLoading && !summary && (
        <Paper p="xl" withBorder ta="center" radius="md">
          <Stack align="center" gap="sm">
            <IconUsers size={48} opacity={0.3} />
            <Text c="dimmed" fw={500}>
              Загрузите первый Excel-файл для отображения статистики
            </Text>
          </Stack>
        </Paper>
      )}

      <SimpleGrid cols={{ base: 1, xs: 2, md: 3, lg: 6 }} spacing="md">
        <StatsCard
          title="Посещаемость"
          value={summary ? `${summary.attendance_pct.toFixed(1)}%` : '—'}
          icon={IconCalendarStats}
          color="blue"
          loading={isLoading}
        />
        <StatsCard
          title="Средний приход"
          value={summary?.avg_arrival_time ?? '—'}
          icon={IconClock}
          color="green"
          loading={isLoading}
        />
        <StatsCard
          title="Средний уход"
          value={summary?.avg_departure_time ?? '—'}
          icon={IconClockHour4}
          color="cyan"
          loading={isLoading}
        />
        <StatsCard
          title="Опоздания"
          value={summary?.late_count ?? '—'}
          icon={IconAlertTriangle}
          color="orange"
          loading={isLoading}
        />
        <StatsCard
          title="Переработки"
          value={summary?.overtime_count ?? '—'}
          icon={IconTrendingUp}
          color="violet"
          loading={isLoading}
        />
        <StatsCard
          title="Ср. продолжительность"
          value={
            summary?.avg_duration_hours != null
              ? `${summary.avg_duration_hours.toFixed(1)} ч`
              : '—'
          }
          icon={IconClock}
          color="teal"
          loading={isLoading}
        />
      </SimpleGrid>

      <Grid>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <TrendChart params={params} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <HeatmapChart params={params} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }} style={{ display: 'flex', flexDirection: 'column' }}>
          <TopLateChart params={params} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 6 }} style={{ display: 'flex', flexDirection: 'column' }}>
          <CheckpointChart params={params} />
        </Grid.Col>
      </Grid>

      <YearCalendar />
    </Stack>
  );
}
