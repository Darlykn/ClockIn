import React from 'react';
import {
  Paper,
  Text,
  Group,
  Stack,
  Badge,
  Popover,
  Skeleton,
} from '@mantine/core';
import { Calendar } from '@mantine/dates';
import dayjs from 'dayjs';
import 'dayjs/locale/ru';
import { useCalendar } from '../../hooks/useStats';
import type { DailyStatus, DayStatus } from '../../types';

dayjs.locale('ru');

const STATUS_COLORS: Record<DayStatus, string> = {
  normal: '#2f9e44',
  late: '#e67700',
  absent: '#c92a2a',
  weekend: '#868e96',
};

const STATUS_LABELS: Record<DayStatus, string> = {
  normal: 'Норма',
  late: 'Опоздание',
  absent: 'Отсутствие',
  weekend: 'Выходной',
};

interface StatusCalendarProps {
  employeeId: string | undefined;
  year: number;
  month: number;
  onMonthYearChange?: (year: number, month: number) => void;
}

export function StatusCalendar({ employeeId, year, month, onMonthYearChange }: StatusCalendarProps) {
  const { data, isLoading } = useCalendar(employeeId, year, month);

  const dayMap = new Map<string, DailyStatus>();
  data?.forEach((d) => dayMap.set(d.date, d));

  const handleViewChange = (date: Date | string) => {
    if (!onMonthYearChange) return;
    const d = typeof date === 'string' ? new Date(date) : date;
    onMonthYearChange(d.getFullYear(), d.getMonth() + 1);
  };

  if (isLoading) return <Skeleton height={360} radius="md" />;

  return (
    <Paper p="md" withBorder radius="md">
      <Calendar
        locale="ru"
        date={new Date(year, month - 1, 1)}
        onDateChange={handleViewChange}
        onNextMonth={handleViewChange}
        onPreviousMonth={handleViewChange}
        onMonthSelect={handleViewChange}
        onYearSelect={handleViewChange}
        getDayProps={(date) => {
          const dateObj = typeof date === 'string' ? new Date(date) : date;
          const key = dayjs(dateObj).format('YYYY-MM-DD');
          const status = dayMap.get(key);
          if (!status) return {};
          return {
              style: {
                  backgroundColor: STATUS_COLORS[status.status] + '33',
                  borderRadius: 6,
                  border: `2px solid ${STATUS_COLORS[status.status]}`,
                } as React.CSSProperties,
          };
        }}
        renderDay={(date) => {
          const dateObj = typeof date === 'string' ? new Date(date) : date;
          const key = dayjs(dateObj).format('YYYY-MM-DD');
          const status = dayMap.get(key);
          const dayNum = dateObj.getDate();

          if (!status) {
            return <Text size="sm">{dayNum}</Text>;
          }

          return (
            <Popover width={220} withArrow position="bottom">
              <Popover.Target>
                <Text
                  size="sm"
                  fw={600}
                  style={{
                    color: STATUS_COLORS[status.status],
                    cursor: 'pointer',
                  }}
                >
                  {dayNum}
                </Text>
              </Popover.Target>
              <Popover.Dropdown>
                <Stack gap={4}>
                  <Group justify="space-between">
                    <Text size="xs" c="dimmed">
                      {dayjs(date).format('D MMMM YYYY')}
                    </Text>
                    <Badge
                      size="xs"
                      color={
                        status.status === 'normal'
                          ? 'green'
                          : status.status === 'late'
                          ? 'orange'
                          : status.status === 'absent'
                          ? 'red'
                          : 'gray'
                      }
                    >
                      {STATUS_LABELS[status.status]}
                    </Badge>
                  </Group>
                  {status.first_entry && (
                    <Text size="xs">
                      Приход: <b>{status.first_entry}</b>
                    </Text>
                  )}
                  {status.last_entry && (
                    <Text size="xs">
                      Уход: <b>{status.last_entry}</b>
                    </Text>
                  )}
                  {status.checkpoint && (
                    <Text size="xs">
                      Точка: <b>{status.checkpoint}</b>
                    </Text>
                  )}
                </Stack>
              </Popover.Dropdown>
            </Popover>
          );
        }}
      />

      <Group gap="sm" mt="md" wrap="wrap">
        {(Object.entries(STATUS_LABELS) as [DayStatus, string][]).map(
          ([status, label]) => (
            <Group gap={4} key={status}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  backgroundColor: STATUS_COLORS[status],
                }}
              />
              <Text size="xs">{label}</Text>
            </Group>
          )
        )}
      </Group>
    </Paper>
  );
}
