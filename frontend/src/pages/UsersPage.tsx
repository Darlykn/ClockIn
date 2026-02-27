import { useState, useMemo, type CSSProperties } from 'react';
import {
  Stack,
  Title,
  Paper,
  Table,
  Badge,
  Text,
  Skeleton,
  Alert,
  Group,
  Button,
  TextInput,
  Modal,
  Select,
  PasswordInput,
  ActionIcon,
  Tooltip,
  Checkbox,
  Divider,
  UnstyledButton,
  Box,
  Loader,
  Center,
  Collapse,
} from '@mantine/core';
import { DatePickerInput } from '@mantine/dates';
import { useDisclosure } from '@mantine/hooks';
import { useForm } from '@mantine/form';
import { useQuery } from '@tanstack/react-query';
import {
  IconAlertCircle,
  IconSearch,
  IconPlus,
  IconUserOff,
  IconUserCheck,
  IconEdit,
  IconLink,
  IconChevronDown,
  IconDownload,
  IconLogin2,
  IconLogout,
} from '@tabler/icons-react';
import * as XLSX from 'xlsx';
import dayjs from 'dayjs';
import { notifications } from '@mantine/notifications';
import { useAuth } from '../providers/AuthProvider';
import { useUsers, useCreateUser, useUpdateUser } from '../hooks/useUsers';
import { usersApi, type UserCreatePayload } from '../api/users';
import { statsApi } from '../api/stats';
import type { User, UserRole } from '../types';

type SortField = 'full_name' | 'username' | 'email' | 'role' | 'has_2fa' | 'is_active';
type SortDir = 'asc' | 'desc';

const ROLE_COLORS: Record<UserRole, string> = {
  admin: 'brand',
  manager: 'blue',
  employee: 'gray',
};

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Администратор',
  manager: 'Менеджер',
  employee: 'Сотрудник',
};

interface SortHeaderProps {
  field: SortField;
  sortField: SortField | null;
  sortDir: SortDir;
  onSort: (field: SortField) => void;
  children: React.ReactNode;
}

function SortHeader({ field, sortField, sortDir, onSort, children }: SortHeaderProps) {
  const active = sortField === field;
  const sortIcon = active ? (sortDir === 'asc' ? '^' : '˅') : '^˅';
  return (
    <UnstyledButton
      onClick={() => onSort(field)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <Text fw={600} size="sm" style={{ whiteSpace: 'nowrap' }}>
        {children}
      </Text>
      <Text
        fw={600}
        size="xs"
        style={{
          opacity: active ? 1 : 0.35,
          marginLeft: 8,
          flexShrink: 0,
          fontFamily: 'ui-monospace, monospace',
        }}
      >
        {sortIcon}
      </Text>
    </UnstyledButton>
  );
}

// ---------------------------------------------------------------------------
// Attendance expand panel (inline in table row)
// ---------------------------------------------------------------------------

interface AttendancePanelProps {
  user: User;
}

function AttendancePanel({ user }: AttendancePanelProps) {
  const [range, setRange] = useState<[string | null, string | null]>([
    dayjs().startOf('month').format('YYYY-MM-DD'),
    dayjs().format('YYYY-MM-DD'),
  ]);

  const [exporting, setExporting] = useState(false);

  const { data: logs, isLoading } = useQuery({
    queryKey: ['employee-logs', user.id, range[0], range[1]],
    queryFn: () =>
      statsApi.getEmployeeLogs(user.id, range[0] ?? undefined, range[1] ?? undefined),
    enabled: !!(range[0] && range[1]),
    staleTime: 5 * 60 * 1000,
  });

  const handleExport = async () => {
    const from = range[0] ?? dayjs().startOf('month').format('YYYY-MM-DD');
    const to = range[1] ?? dayjs().format('YYYY-MM-DD');

    setExporting(true);
    try {
      const exportLogs = await statsApi.getEmployeeLogs(user.id, from, to);

      const wsData = exportLogs.map((log) => ({
        Дата: dayjs(log.event_time).format('DD.MM.YYYY'),
        Время: dayjs(log.event_time).format('HH:mm:ss'),
        Тип: log.event_type === 'entry' ? 'Вход' : 'Выход',
        'Точка доступа': log.checkpoint,
      }));

      const ws = XLSX.utils.json_to_sheet(wsData);
      ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 30 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Посещаемость');

      const safeName = (user.full_name ?? user.username).replace(/[^\w\s\u0400-\u04FF-]/g, '');
      XLSX.writeFile(wb, `${safeName}_${from}_${to}.xlsx`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <Box p="md" style={{ background: 'var(--bg-sidebar)' }}>
      {/* Period selector + export */}
      <Group align="flex-end" gap="sm" wrap="wrap" mb="md">
        <DatePickerInput
          type="range"
          label="Период для экспорта"
          value={range}
          onChange={setRange}
          locale="ru"
          allowSingleDateInRange
          style={{ flex: '1 1 260px', maxWidth: 360 }}
        />
        <Button
          leftSection={<IconDownload size={14} />}
          variant="light"
          color="green"
          onClick={handleExport}
          loading={exporting}
          disabled={!range[0] || !range[1]}
          mb={1}
        >
          Скачать Excel
        </Button>
      </Group>

      {/* Logs table */}
      {isLoading ? (
        <Center py="md">
          <Loader size="sm" />
        </Center>
      ) : !logs?.length ? (
        <Text c="dimmed" ta="center" py="sm" size="sm">
          Нет данных за выбранный период
        </Text>
      ) : (
        <Paper
          withBorder
          radius="sm"
          style={{ overflow: 'hidden', borderColor: 'var(--border-subtle)' }}
        >
          <Table
            highlightOnHover
            style={
              {
                '--table-highlight-on-hover-color': 'var(--bg-sidebar)',
                '--table-border-color': 'var(--border-subtle)',
              } as CSSProperties
            }
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Дата</Table.Th>
                <Table.Th>Время</Table.Th>
                <Table.Th>Тип события</Table.Th>
                <Table.Th>Точка доступа</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {logs.map((log, i) => (
                <Table.Tr key={i}>
                  <Table.Td>
                    <Text size="sm">{dayjs(log.event_time).format('DD.MM.YYYY')}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" ff="monospace">
                      {dayjs(log.event_time).format('HH:mm:ss')}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Badge
                      color={log.event_type === 'entry' ? 'green' : 'orange'}
                      size="sm"
                      variant="light"
                      leftSection={
                        log.event_type === 'entry' ? (
                          <IconLogin2 size={10} />
                        ) : (
                          <IconLogout size={10} />
                        )
                      }
                    >
                      {log.event_type === 'entry' ? 'Вход' : 'Выход'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c="dimmed">
                      {log.checkpoint}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filter2fa, setFilter2fa] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [createOpened, { open: openCreate, close: closeCreate }] = useDisclosure();
  const [editUser, setEditUser] = useState<{
    id: string;
    role: UserRole;
    email: string;
    has_2fa: boolean;
    reset_2fa: boolean;
  } | null>(null);

  const { data, isLoading, isError } = useUsers(search || undefined);
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      if (sortDir === 'asc') {
        setSortDir('desc');
      } else {
        setSortField(null);
        setSortDir('asc');
      }
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const displayedUsers = useMemo(() => {
    let users = data ?? [];

    if (filterRole) users = users.filter((u) => u.role === filterRole);
    if (filterStatus)
      users = users.filter((u) => (filterStatus === 'active' ? u.is_active : !u.is_active));
    if (filter2fa)
      users = users.filter((u) => (filter2fa === 'enabled' ? u.has_2fa : !u.has_2fa));

    if (sortField) {
      users = [...users].sort((a, b) => {
        let aVal = '';
        let bVal = '';
        switch (sortField) {
          case 'full_name':
            aVal = a.full_name ?? '';
            bVal = b.full_name ?? '';
            break;
          case 'username':
            aVal = a.username;
            bVal = b.username;
            break;
          case 'email':
            aVal = a.email ?? '';
            bVal = b.email ?? '';
            break;
          case 'role':
            aVal = ROLE_LABELS[a.role];
            bVal = ROLE_LABELS[b.role];
            break;
          case 'has_2fa':
            aVal = a.has_2fa ? '1' : '0';
            bVal = b.has_2fa ? '1' : '0';
            break;
          case 'is_active':
            aVal = a.is_active ? '1' : '0';
            bVal = b.is_active ? '1' : '0';
            break;
        }
        const cmp = aVal.localeCompare(bVal, 'ru', { sensitivity: 'base' });
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }

    return users;
  }, [data, filterRole, filterStatus, filter2fa, sortField, sortDir]);

  const createForm = useForm<UserCreatePayload>({
    initialValues: { username: '', full_name: '', email: '', password: '', role: 'employee' },
    validate: {
      username: (v) => (!v ? 'Введите логин' : null),
      full_name: (v) => (!v ? 'Введите ФИО' : null),
      password: (v) => (v.length < 6 ? 'Минимум 6 символов' : null),
    },
  });

  const handleCreate = async (values: UserCreatePayload) => {
    await createUser.mutateAsync(values);
    createForm.reset();
    closeCreate();
  };

  const handleToggleActive = (id: string, currentActive: boolean) => {
    updateUser.mutate({ id, payload: { is_active: !currentActive } });
  };

  const handleEditSave = () => {
    if (!editUser) return;
    const payload: Parameters<typeof updateUser.mutate>[0]['payload'] = {
      role: editUser.role,
      email: editUser.email || undefined,
    };
    if (editUser.reset_2fa) payload.reset_2fa = true;
    updateUser.mutate({ id: editUser.id, payload });
    setEditUser(null);
  };

  const handleCopyInviteLink = async (id: string) => {
    try {
      const { invite_token } = await usersApi.generateInvite(id);
      const link = `${window.location.origin}/first-login?token=${invite_token}`;
      await navigator.clipboard.writeText(link);
      notifications.show({
        title: 'Ссылка скопирована',
        message: 'Ссылка для первого входа скопирована в буфер обмена',
        color: 'green',
      });
    } catch {
      notifications.show({
        title: 'Ошибка',
        message: 'Не удалось сгенерировать ссылку',
        color: 'red',
      });
    }
  };

  if (isError)
    return (
      <Alert icon={<IconAlertCircle size={16} />} color="brand" variant="light">
        Ошибка загрузки пользователей
      </Alert>
    );

  return (
    <Stack gap="lg">
      <Group justify="space-between">
        <Title order={2}>Сотрудники</Title>
        <Button leftSection={<IconPlus size={16} />} onClick={openCreate} color="brand">
          Добавить пользователя
        </Button>
      </Group>

      <Group align="flex-end" wrap="wrap" gap="sm">
        <TextInput
          placeholder="Поиск по ФИО, логину или почте..."
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: '1 1 220px', minWidth: 200, maxWidth: 340 }}
        />
        <Select
          placeholder="Роль"
          clearable
          value={filterRole}
          onChange={setFilterRole}
          data={[
            { value: 'admin', label: 'Администратор' },
            { value: 'manager', label: 'Менеджер' },
            { value: 'employee', label: 'Сотрудник' },
          ]}
          style={{ width: 170 }}
        />
        <Select
          placeholder="Статус"
          clearable
          value={filterStatus}
          onChange={setFilterStatus}
          data={[
            { value: 'active', label: 'Активен' },
            { value: 'inactive', label: 'Заблокирован' },
          ]}
          style={{ width: 160 }}
        />
        <Select
          placeholder="2FA"
          clearable
          value={filter2fa}
          onChange={setFilter2fa}
          data={[
            { value: 'enabled', label: 'Настроена' },
            { value: 'disabled', label: 'Не настроена' },
          ]}
          style={{ width: 160 }}
        />
      </Group>

      <Paper
        withBorder
        radius="md"
        style={{
          overflow: 'hidden',
          borderColor: 'var(--border-subtle)',
          backgroundColor: 'var(--bg-card)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        <Table
          highlightOnHover
          style={
            {
              '--table-highlight-on-hover-color': 'var(--bg-sidebar)',
              '--table-border-color': 'var(--border-subtle)',
            } as CSSProperties
          }
        >
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ width: 28 }} />
              <Table.Th>
                <SortHeader field="full_name" sortField={sortField} sortDir={sortDir} onSort={handleSort}>
                  ФИО
                </SortHeader>
              </Table.Th>
              <Table.Th>
                <SortHeader field="username" sortField={sortField} sortDir={sortDir} onSort={handleSort}>
                  Логин
                </SortHeader>
              </Table.Th>
              <Table.Th>
                <SortHeader field="email" sortField={sortField} sortDir={sortDir} onSort={handleSort}>
                  Email
                </SortHeader>
              </Table.Th>
              <Table.Th>
                <SortHeader field="role" sortField={sortField} sortDir={sortDir} onSort={handleSort}>
                  Роль
                </SortHeader>
              </Table.Th>
              <Table.Th>
                <SortHeader field="has_2fa" sortField={sortField} sortDir={sortDir} onSort={handleSort}>
                  2FA
                </SortHeader>
              </Table.Th>
              <Table.Th>
                <SortHeader field="is_active" sortField={sortField} sortDir={sortDir} onSort={handleSort}>
                  Статус
                </SortHeader>
              </Table.Th>
              <Table.Th>Действия</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Table.Tr key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <Table.Td key={j}>
                      <Skeleton height={24} />
                    </Table.Td>
                  ))}
                </Table.Tr>
              ))
            ) : displayedUsers.length === 0 ? (
              <Table.Tr>
                <Table.Td colSpan={8}>
                  <Text c="dimmed" ta="center" py="md" size="sm">
                    Пользователи не найдены
                  </Text>
                </Table.Td>
              </Table.Tr>
            ) : (
              displayedUsers.map((u) => (
                <UserRows
                  key={u.id}
                  u={u}
                  currentUserId={currentUser?.id}
                  expanded={expandedId === u.id}
                  onToggleExpand={() => toggleExpand(u.id)}
                  onEdit={() =>
                    setEditUser({
                      id: u.id,
                      role: u.role,
                      email: u.email ?? '',
                      has_2fa: u.has_2fa,
                      reset_2fa: false,
                    })
                  }
                  onCopyLink={() => handleCopyInviteLink(u.id)}
                  onToggleActive={() => handleToggleActive(u.id, u.is_active)}
                />
              ))
            )}
          </Table.Tbody>
        </Table>
      </Paper>

      {/* Create user modal */}
      <Modal opened={createOpened} onClose={closeCreate} title="Добавить пользователя" centered>
        <form onSubmit={createForm.onSubmit(handleCreate)}>
          <Stack gap="md">
            <TextInput label="ФИО" placeholder="Иванов Иван Иванович" {...createForm.getInputProps('full_name')} />
            <TextInput label="Логин" placeholder="ivanov" {...createForm.getInputProps('username')} />
            <TextInput label="Email" placeholder="ivanov@company.ru" {...createForm.getInputProps('email')} />
            <PasswordInput label="Пароль" placeholder="••••••••" {...createForm.getInputProps('password')} />
            <Select
              label="Роль"
              data={[
                { value: 'employee', label: 'Сотрудник' },
                { value: 'manager', label: 'Менеджер' },
                { value: 'admin', label: 'Администратор' },
              ]}
              {...createForm.getInputProps('role')}
            />
            <Button type="submit" loading={createUser.isPending} fullWidth>
              Создать
            </Button>
          </Stack>
        </form>
      </Modal>

      {/* Edit user modal */}
      <Modal
        opened={!!editUser}
        onClose={() => setEditUser(null)}
        title="Изменить пользователя"
        centered
      >
        {editUser && (
          <Stack gap="md">
            <Select
              label="Роль"
              value={editUser.role}
              onChange={(v) => v && setEditUser({ ...editUser, role: v as UserRole })}
              data={[
                { value: 'employee', label: 'Сотрудник' },
                { value: 'manager', label: 'Менеджер' },
                { value: 'admin', label: 'Администратор' },
              ]}
            />
            <TextInput
              label="Email"
              placeholder="user@company.ru"
              value={editUser.email}
              onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
            />
            <Divider label="Двухфакторная аутентификация" labelPosition="left" />
            <Checkbox
              label="Сбросить 2FA"
              description={
                editUser.has_2fa
                  ? 'При сохранении привязка 2FA будет удалена'
                  : 'У пользователя нет активной 2FA'
              }
              disabled={!editUser.has_2fa}
              checked={editUser.reset_2fa}
              onChange={(e) => setEditUser({ ...editUser, reset_2fa: e.currentTarget.checked })}
            />
            <Button onClick={handleEditSave} loading={updateUser.isPending} fullWidth>
              Сохранить
            </Button>
          </Stack>
        )}
      </Modal>
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// Extracted row pair: main row + expandable attendance row
// ---------------------------------------------------------------------------

interface UserRowsProps {
  u: User;
  currentUserId?: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onCopyLink: () => void;
  onToggleActive: () => void;
}

function UserRows({
  u,
  currentUserId,
  expanded,
  onToggleExpand,
  onEdit,
  onCopyLink,
  onToggleActive,
}: UserRowsProps) {
  return (
    <>
      <Table.Tr
        style={{ cursor: 'pointer' }}
        onClick={onToggleExpand}
        data-expanded={expanded}
      >
        <Table.Td onClick={(e) => e.stopPropagation()} style={{ paddingRight: 0 }}>
          <ActionIcon
            variant="subtle"
            size="sm"
            color="gray"
            onClick={onToggleExpand}
            style={{
              transition: 'transform 200ms ease',
              transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          >
            <IconChevronDown size={14} />
          </ActionIcon>
        </Table.Td>
        <Table.Td>{u.full_name}</Table.Td>
        <Table.Td>
          <Text size="sm" ff="monospace">
            {u.username}
          </Text>
        </Table.Td>
        <Table.Td>
          <Text size="sm" c={u.email ? undefined : 'dimmed'}>
            {u.email ?? '—'}
          </Text>
        </Table.Td>
        <Table.Td>
          <Badge color={ROLE_COLORS[u.role]} size="sm">
            {ROLE_LABELS[u.role]}
          </Badge>
        </Table.Td>
        <Table.Td>
          <Badge color={u.has_2fa ? 'green' : 'gray'} variant="dot" size="sm">
            {u.has_2fa ? 'Настроена' : 'Не настроена'}
          </Badge>
        </Table.Td>
        <Table.Td>
          <Badge color={u.is_active ? 'green' : 'brand'} size="sm" variant="light">
            {u.is_active ? 'Активен' : 'Заблокирован'}
          </Badge>
        </Table.Td>
        <Table.Td onClick={(e) => e.stopPropagation()}>
          <Group gap="xs">
            <Tooltip label="Изменить">
              <ActionIcon variant="subtle" size="sm" color="gray" onClick={onEdit}>
                <IconEdit size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Создать ссылку для входа">
              <ActionIcon variant="subtle" size="sm" color="blue" onClick={onCopyLink}>
                <IconLink size={14} />
              </ActionIcon>
            </Tooltip>
            {currentUserId !== u.id && (
              <Tooltip label={u.is_active ? 'Деактивировать' : 'Активировать'}>
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  color={u.is_active ? 'brand' : 'green'}
                  onClick={onToggleActive}
                >
                  {u.is_active ? <IconUserOff size={14} /> : <IconUserCheck size={14} />}
                </ActionIcon>
              </Tooltip>
            )}
          </Group>
        </Table.Td>
      </Table.Tr>

      <Table.Tr style={{ borderTop: expanded ? undefined : 'none' }}>
        <Table.Td colSpan={8} p={0} style={{ borderBottom: expanded ? undefined : 'none' }}>
          <Collapse in={expanded} transitionDuration={250}>
            <AttendancePanel user={u} />
          </Collapse>
        </Table.Td>
      </Table.Tr>
    </>
  );
}
