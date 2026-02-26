import React, { useMemo, useRef, useState } from 'react';
import {
  Paper,
  Text,
  Group,
  Stack,
  Badge,
  Select,
  Skeleton,
  Box,
} from '@mantine/core';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import 'dayjs/locale/ru';
import { useCalendarRange } from '../../hooks/useStats';
import { useEmployees } from '../../hooks/useUsers';
import { useAuth } from '../../providers/AuthProvider';
import type { DailyStatus, DayStatus } from '../../types';

dayjs.extend(isoWeek);
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

const STATUS_BADGE_COLORS: Record<DayStatus, string> = {
  normal: 'green',
  late: 'orange',
  absent: 'red',
  weekend: 'gray',
};

const CELL_SIZE = 13;
const CELL_GAP = 3;
const CELL_STEP = CELL_SIZE + CELL_GAP; // 16px per column
const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const DAY_LABEL_WIDTH = 26;
// minimum pixel gap between month label starts to avoid overlap
const MONTH_LABEL_MIN_PX = 30;
const MONTH_NAMES = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

const currentYear = dayjs().year();
const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => {
  const y = currentYear - i;
  return { value: String(y), label: String(y) };
});

interface TooltipContent {
  dayData: DailyStatus;
  // viewport-relative coordinates
  clientX: number;
  clientY: number;
  cellBottom: number;
}

export function YearCalendar() {
  const { user } = useAuth();
  const { data: employees } = useEmployees();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(
    isAdmin ? null : String(user?.employee_id ?? '')
  );
  const [selectedYear, setSelectedYear] = useState<string>(String(currentYear));
  const [tooltip, setTooltip] = useState<TooltipContent | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const today = dayjs();
  const year = Number(selectedYear);
  const dateFrom = `${year}-01-01`;
  const dateTo = year === currentYear
    ? today.format('YYYY-MM-DD')
    : `${year}-12-31`;

  const { data, isLoading } = useCalendarRange(
    selectedEmployee ?? undefined,
    dateFrom,
    dateTo
  );

  const employeeOptions = employees?.map((e) => ({
    value: String(e.id),
    label: e.full_name,
  })) ?? [];

  const dayMap = useMemo(() => {
    const m = new Map<string, DailyStatus>();
    data?.forEach((d) => m.set(d.date, d));
    return m;
  }, [data]);

  // Grid starts on Monday of the week containing Jan 1 of the selected year
  const gridStart = useMemo(
    () => dayjs(`${year}-01-01`).startOf('isoWeek'),
    [year]
  );

  // Grid always ends at Dec 31 — future cells are rendered as quiet skeletons
  const gridEnd = useMemo(
    () => dayjs(`${year}-12-31`),
    [year]
  );

  // Build weeks: each week is an array of 7 dayjs objects
  const weeks = useMemo(() => {
    const result: dayjs.Dayjs[][] = [];
    let cur = gridStart;
    while (cur.isBefore(gridEnd, 'day') || cur.isSame(gridEnd, 'day')) {
      const week: dayjs.Dayjs[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(cur.add(i, 'day'));
      }
      result.push(week);
      cur = cur.add(7, 'day');
    }
    return result;
  }, [gridStart, gridEnd]);

  // Month labels: only for months within the selected year, filtered to prevent overlap
  const monthLabels = useMemo(() => {
    const raw: { weekIndex: number; label: string }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, wi) => {
      const firstDay = week[0];
      // Skip days/weeks that belong to a different year (e.g. Dec 29-31 bleeding in from prev year)
      if (firstDay.year() !== year && week.every((d) => d.year() !== year)) return;
      // Use the first day that actually belongs to the selected year
      const refDay = firstDay.year() === year ? firstDay : week.find((d) => d.year() === year)!;
      const m = refDay.month();
      if (m !== lastMonth) {
        raw.push({ weekIndex: wi, label: MONTH_NAMES[m] });
        lastMonth = m;
      }
    });
    // Filter labels that start too close to the previous one
    const filtered: typeof raw = [];
    raw.forEach((entry) => {
      const prev = filtered[filtered.length - 1];
      if (!prev || (entry.weekIndex - prev.weekIndex) * CELL_STEP >= MONTH_LABEL_MIN_PX) {
        filtered.push(entry);
      }
    });
    return filtered;
  }, [weeks, year]);

  const activeCount = useMemo(
    () => data?.filter((d) => d.status === 'normal' || d.status === 'late').length ?? 0,
    [data]
  );

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>, dayData: DailyStatus) => {
    const rect = (e.target as HTMLDivElement).getBoundingClientRect();
    setTooltip({
      dayData,
      clientX: rect.left + CELL_SIZE / 2,
      clientY: rect.top,
      cellBottom: rect.bottom,
    });
  };

  const handleMouseLeave = () => setTooltip(null);

  if (isLoading) return <Skeleton height={200} radius="md" />;

  return (
    <Paper p="md" withBorder radius="md">
      <Stack gap="md">
        {/* Header: selectors left, count right */}
        <Group justify="space-between" align="flex-end" wrap="wrap">
          <Group gap="sm" align="flex-end" wrap="wrap">
            {isAdmin && (
              <Select
                label="Сотрудник"
                placeholder="Выберите сотрудника"
                data={employeeOptions}
                value={selectedEmployee}
                onChange={setSelectedEmployee}
                clearable
                searchable
                w={220}
                size="sm"
              />
            )}
            <Select
              label="Год"
              data={YEAR_OPTIONS}
              value={selectedYear}
              onChange={(v) => v && setSelectedYear(v)}
              w={100}
              size="sm"
            />
          </Group>
          <Text fw={600} size="lg">
            {activeCount}{' '}
            {activeCount === 1
              ? 'активность'
              : activeCount >= 2 && activeCount <= 4
              ? 'активности'
              : 'активностей'}{' '}
            за {year} год
          </Text>
        </Group>

        {/* Grid */}
        <Box ref={containerRef} style={{ position: 'relative', overflowX: 'auto' }}>
          <Box style={{ position: 'relative' }}>
            {/* Month labels row */}
            <Box
              style={{
                display: 'flex',
                marginLeft: DAY_LABEL_WIDTH,
                marginBottom: 4,
                position: 'relative',
                height: 16,
              }}
            >
              {monthLabels.map(({ weekIndex, label }) => (
                <Text
                  key={`${weekIndex}-${label}`}
                  size="xs"
                  c="dimmed"
                  style={{
                    position: 'absolute',
                    left: weekIndex * CELL_STEP,
                    whiteSpace: 'nowrap',
                    lineHeight: 1,
                    fontSize: 11,
                  }}
                >
                  {label}
                </Text>
              ))}
            </Box>

            {/* Day labels + cells */}
            <Box style={{ display: 'flex', gap: 0 }}>
              {/* Day-of-week labels — all 7 shown */}
              <Box
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: CELL_GAP,
                  width: DAY_LABEL_WIDTH,
                  flexShrink: 0,
                }}
              >
                {DAY_LABELS.map((label) => (
                  <Box
                    key={label}
                    style={{ height: CELL_SIZE, display: 'flex', alignItems: 'center' }}
                  >
                    <Text size="xs" c="dimmed" style={{ lineHeight: 1, fontSize: 10 }}>
                      {label}
                    </Text>
                  </Box>
                ))}
              </Box>

              {/* Week columns */}
              <Box style={{ display: 'flex', gap: CELL_GAP }}>
                {weeks.map((week, wi) => (
                  <Box
                    key={wi}
                    style={{ display: 'flex', flexDirection: 'column', gap: CELL_GAP }}
                  >
                    {week.map((day, di) => {
                      const key = day.format('YYYY-MM-DD');
                      const dayData = dayMap.get(key);
                      const isFuture = day.isAfter(today, 'day');
                      const isOutOfYear = day.year() !== year;

                      // Days outside the selected year — invisible spacer to preserve grid alignment
                      if (isOutOfYear) {
                        return (
                          <Box key={di} style={{ width: CELL_SIZE, height: CELL_SIZE }} />
                        );
                      }

                      // Future days — white fill + faint dashed border (no opacity on the whole cell)
                      if (isFuture) {
                        return (
                          <Box
                            key={di}
                            style={{
                              width: CELL_SIZE,
                              height: CELL_SIZE,
                              borderRadius: 2,
                              backgroundColor: 'var(--mantine-color-white)',
                              border: '1px dashed rgba(0, 0, 0, 0.12)',
                              boxSizing: 'border-box',
                            }}
                          />
                        );
                      }

                      // Past days
                      const color = dayData
                        ? STATUS_COLORS[dayData.status]
                        : 'var(--mantine-color-default-border)';
                      const opacity = dayData ? 1 : 0.3;

                      return (
                        <Box
                          key={di}
                          style={{
                            width: CELL_SIZE,
                            height: CELL_SIZE,
                            borderRadius: 2,
                            backgroundColor: color,
                            opacity,
                            cursor: dayData ? 'pointer' : 'default',
                          }}
                          onMouseEnter={dayData ? (e) => handleMouseEnter(e, dayData) : undefined}
                          onMouseLeave={dayData ? handleMouseLeave : undefined}
                        />
                      );
                    })}
                  </Box>
                ))}
              </Box>
            </Box>
          </Box>

        </Box>

        {tooltip && <TooltipPopup tooltip={tooltip} />}

        {/* Legend */}
        <Group gap="sm" wrap="wrap">
          {(Object.entries(STATUS_LABELS) as [DayStatus, string][]).map(([status, label]) => (
            <Group gap={4} key={status}>
              <Box
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 2,
                  backgroundColor: STATUS_COLORS[status],
                }}
              />
              <Text size="xs" c="dimmed">
                {label}
              </Text>
            </Group>
          ))}
        </Group>
      </Stack>
    </Paper>
  );
}

function TooltipPopup({ tooltip }: { tooltip: TooltipContent }) {
  const { dayData, clientX, clientY, cellBottom } = tooltip;

  const lateMinutes = useMemo(() => {
    if (dayData.status !== 'late' || !dayData.first_entry) return null;
    const [h, m] = dayData.first_entry.split(':').map(Number);
    const diff = h * 60 + m - 9 * 60;
    return diff > 0 ? diff : null;
  }, [dayData]);

  // Show above the cell; if too close to top of viewport, show below instead
  const showBelow = clientY < 100;
  const top = showBelow ? cellBottom + 4 : clientY - 8;
  const transform = showBelow ? 'translateX(-50%)' : 'translate(-50%, -100%)';

  return (
    <Box
      style={{
        position: 'fixed',
        left: clientX,
        top,
        transform,
        zIndex: 9999,
        pointerEvents: 'none',
        minWidth: 164,
      }}
    >
      <Paper shadow="md" p="xs" withBorder radius="md">
        <Stack gap={4}>
          <Group justify="space-between" gap="xs" wrap="nowrap">
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {dayjs(dayData.date).locale('ru').format('D MMMM YYYY')}
            </Text>
            <Badge size="xs" color={STATUS_BADGE_COLORS[dayData.status]} style={{ flexShrink: 0 }}>
              {STATUS_LABELS[dayData.status]}
            </Badge>
          </Group>
          {dayData.first_entry && (
            <Text size="xs">
              Приход: <b>{dayData.first_entry.slice(0, 5)}</b>
            </Text>
          )}
          {lateMinutes !== null && (
            <Text size="xs" c="orange">
              Опоздание: <b>{lateMinutes} мин</b>
            </Text>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}
