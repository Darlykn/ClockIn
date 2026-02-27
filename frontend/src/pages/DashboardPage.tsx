import { useState } from 'react';
import {
  Box,
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
import { WorkHoursChart } from '../components/Charts/WorkHoursChart';
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
  if (loading) return <Skeleton height={90} radius="md" />;
  return (
    <Paper
      p="sm"
      radius="md"
      style={{
        backgroundColor: 'var(--bg-card)',
        boxShadow: 'var(--shadow-card)',
        minWidth: 0,
        cursor: 'default',
        transition: 'transform var(--transition-fast), box-shadow var(--transition-fast)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-1px)';
        e.currentTarget.style.boxShadow = 'var(--shadow-card-hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.boxShadow = 'var(--shadow-card)';
      }}
    >
      <Group gap="sm" wrap="nowrap" align="center">
        <ThemeIcon size={42} variant="light" color={color} radius="md" style={{ flexShrink: 0 }}>
          <Icon size={20} />
        </ThemeIcon>
        <Stack gap={2} style={{ minWidth: 0, overflow: 'hidden' }}>
          <Text
            size="xs"
            c="dimmed"
            fw={600}
            style={{
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {title}
          </Text>
          <Text fw={700} size="xl" style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
            {value}
          </Text>
        </Stack>
      </Group>
    </Paper>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const { data: employees } = useEmployees(isAdmin);

  const STORAGE_KEY = 'AttendTrack-dashboard-period';

  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(
    isAdmin ? null : (user?.id ?? null)
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
        <Badge variant="light" color="gray" size="lg">
          {dateFrom ? dayjs(dateFrom).format('MMM YYYY') : '—'}
        </Badge>
      </Group>

      <Paper
        p="md"
        radius="md"
        style={{
          backgroundColor: 'var(--bg-card)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
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
        <Alert color="brand" icon={<IconAlertTriangle size={16} />} variant="light">
          Ошибка загрузки данных. Проверьте подключение к серверу.
        </Alert>
      )}

      {!isError && !isLoading && !summary && (
        <Paper
          p="xl"
          ta="center"
          radius="md"
          style={{ backgroundColor: 'var(--bg-card)' }}
        >
          <Stack align="center" gap="sm">
            <IconUsers size={48} opacity={0.3} />
            <Text c="dimmed" fw={500}>
              Загрузите первый Excel-файл для отображения статистики
            </Text>
          </Stack>
        </Paper>
      )}

      <SimpleGrid cols={{ base: 2, sm: 3, xl: 6 }} spacing="md">
        <StatsCard
          title="Посещаемость"
          value={summary ? `${summary.attendance_pct.toFixed(1)}%` : '—'}
          icon={IconCalendarStats}
          color="brand"
          loading={isLoading}
        />
        <StatsCard
          title="Ср. время входа"
          value={summary?.avg_arrival_time ?? '—'}
          icon={IconClock}
          color="brand"
          loading={isLoading}
        />
        <StatsCard
          title="Ср. время выхода"
          value={summary?.avg_departure_time ?? '—'}
          icon={IconClockHour4}
          color="brand"
          loading={isLoading}
        />
        <StatsCard
          title="Опоздания"
          value={summary?.late_count ?? '—'}
          icon={IconAlertTriangle}
          color="brand"
          loading={isLoading}
        />
        <StatsCard
          title="Переработки"
          value={summary?.overtime_count ?? '—'}
          icon={IconTrendingUp}
          color="brand"
          loading={isLoading}
        />
        <StatsCard
          title="Ср. Рабочий день"
          value={
            summary?.avg_duration_hours != null
              ? `${summary.avg_duration_hours.toFixed(1)} ч`
              : '—'
          }
          icon={IconClock}
          color="brand"
          loading={isLoading}
        />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
        <TrendChart params={params} />
        <HeatmapChart params={params} />
        {isAdmin ? (
          <Box style={{ display: 'flex', flexDirection: 'column' }}>
            <TopLateChart params={params} />
          </Box>
        ) : (
          <Box style={{ display: 'flex', flexDirection: 'column' }}>
            <WorkHoursChart params={params} />
          </Box>
        )}
        <Box style={{ display: 'flex', flexDirection: 'column' }}>
          <CheckpointChart params={params} />
        </Box>
      </SimpleGrid>

      <YearCalendar />
    </Stack>
  );
}
