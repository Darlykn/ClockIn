import { useState } from 'react';
import { Stack, Title, Group, Select, Paper } from '@mantine/core';
import dayjs from 'dayjs';
import { useAuth } from '../providers/AuthProvider';
import { useEmployees } from '../hooks/useUsers';
import { StatusCalendar } from '../components/Calendar/StatusCalendar';

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: dayjs().month(i).format('MMMM'),
}));

const currentYear = dayjs().year();
const YEAR_OPTIONS = Array.from({ length: 10 }, (_, i) => {
  const y = currentYear - 5 + i;
  return { value: String(y), label: String(y) };
});

export function CalendarPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const { data: employees } = useEmployees();

  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(
    isAdmin ? null : String(user?.employee_id ?? '')
  );
  const [month, setMonth] = useState(String(dayjs().month() + 1));
  const [year, setYear] = useState(String(dayjs().year()));

  const employeeOptions =
    employees?.map((e) => ({
      value: String(e.id),
      label: e.full_name,
    })) ?? [];

  return (
    <Stack gap="lg">
      <Title order={2}>Календарь посещаемости</Title>

      <Paper p="md" withBorder radius="md">
        <Group gap="md" wrap="wrap">
          {isAdmin && (
            <Select
              label="Сотрудник"
              placeholder="Выберите сотрудника"
              data={employeeOptions}
              value={selectedEmployee}
              onChange={setSelectedEmployee}
              clearable
              searchable
              w={250}
            />
          )}
          <Select
            label="Месяц"
            data={MONTH_OPTIONS}
            value={month}
            onChange={(v) => v && setMonth(v)}
            w={150}
          />
          <Select
            label="Год"
            data={YEAR_OPTIONS}
            value={year}
            onChange={(v) => v && setYear(v)}
            w={110}
          />
        </Group>
      </Paper>

      <StatusCalendar
        employeeId={selectedEmployee ?? undefined}
        year={Number(year)}
        month={Number(month)}
        onMonthYearChange={(y, m) => {
          setMonth(String(m));
          setYear(String(y));
        }}
      />
    </Stack>
  );
}
