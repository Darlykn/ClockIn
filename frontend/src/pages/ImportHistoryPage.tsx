import {
  Stack,
  Title,
  Paper,
  Badge,
  Text,
  Skeleton,
  Alert,
  Accordion,
  Group,
  SimpleGrid,
  ScrollArea,
  ThemeIcon,
  Divider,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconFile,
  IconDatabaseImport,
  IconCopy,
  IconAlertTriangle,
  IconCheck,
  IconX,
  IconPlayerSkipForward,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useImportHistory } from '../hooks/useUpload';
import type { ImportHistory } from '../types';

const STATUS_COLORS = {
  success: 'green',
  partial: 'yellow',
  failed: 'red',
} as const;

const STATUS_LABELS = {
  success: 'Успех',
  partial: 'Частичный',
  failed: 'Ошибка',
} as const;

function StatusIcon({ status }: { status: ImportHistory['status'] }) {
  if (status === 'success')
    return <IconCheck size={16} color="var(--success-500)" />;
  if (status === 'partial')
    return <IconAlertCircle size={16} color="var(--warning-500)" />;
  return <IconX size={16} color="var(--error-500)" />;
}

function MiniStat({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <Paper p="xs" withBorder radius="md">
      <Group gap="xs" wrap="nowrap">
        <ThemeIcon color={color} variant="light" size="md" radius="sm">
          {icon}
        </ThemeIcon>
        <Stack gap={0}>
          <Text size="xs" c="dimmed" lh={1.2}>
            {label}
          </Text>
          <Text fw={700} size="sm" c={color} lh={1.4}>
            {value}
          </Text>
        </Stack>
      </Group>
    </Paper>
  );
}

function HistoryAccordionItem({ item }: { item: ImportHistory }) {
  const hasErrors = item.logs.errors.length > 0;

  return (
    <Accordion.Item value={String(item.id)}>
      <Accordion.Control>
        <Group gap="sm" justify="space-between" wrap="nowrap" pr="sm">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
            <StatusIcon status={item.status} />
            <Text
              size="sm"
              fw={500}
              ff="monospace"
              style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {item.filename}
            </Text>
          </Group>
          <Group gap="sm" wrap="nowrap" style={{ flexShrink: 0 }}>
            {item.uploaded_by_name && (
              <Text size="xs" c="dimmed" title="Загрузил">
                {item.uploaded_by_name}
              </Text>
            )}
            <Text size="xs" c="dimmed">
              {dayjs(item.uploaded_at).format('DD.MM.YYYY HH:mm')}
            </Text>
            <Badge color={STATUS_COLORS[item.status]} size="sm">
              {STATUS_LABELS[item.status]}
            </Badge>
          </Group>
        </Group>
      </Accordion.Control>

      <Accordion.Panel>
        <Stack gap="sm">
          <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="xs">
            <MiniStat
              label="Всего строк"
              value={
                // Учитываем пропущенные системные события, чтобы "всего" >= "добавлено" (в т.ч. для старых записей в БД)
                (item.logs.skipped_events?.length ?? 0) > 0
                  ? (item.logs.inserted ?? 0) +
                    (item.logs.skipped ?? 0) +
                    (item.logs.errors?.length ?? 0) +
                    (item.logs.skipped_events?.length ?? 0)
                  : item.logs.total
              }
              color="blue"
              icon={<IconFile size={14} />}
            />
            <MiniStat
              label="Добавлено"
              value={item.logs.inserted}
              color="green"
              icon={<IconDatabaseImport size={14} />}
            />
            <MiniStat
              label="Дубликаты"
              value={item.logs.skipped}
              color="gray"
              icon={<IconCopy size={14} />}
            />
            <MiniStat
              label="Пропущено"
              value={item.logs.skipped_events?.length ?? 0}
              color={(item.logs.skipped_events?.length ?? 0) > 0 ? 'orange' : 'gray'}
              icon={<IconPlayerSkipForward size={14} />}
            />
            <MiniStat
              label="Ошибки"
              value={item.logs.errors.length}
              color={hasErrors ? 'red' : 'gray'}
              icon={<IconAlertTriangle size={14} />}
            />
          </SimpleGrid>

          {hasErrors && (
            <>
              <Divider label="Причины пропуска строк" labelPosition="left" />
              <ScrollArea h={180}>
                <Paper p="sm" bg="var(--mantine-color-red-0)" radius="sm">
                  <Stack gap={4}>
                    {item.logs.errors.map((err, i) => (
                      <Text key={i} size="xs" c="red" ff="monospace">
                        {err}
                      </Text>
                    ))}
                  </Stack>
                </Paper>
              </ScrollArea>
            </>
          )}

          {/* Пропущенные системные события — секция всегда видна */}
          <Divider label="Пропущенные события" labelPosition="left" />
          {(item.logs.skipped_events?.length ?? 0) > 0 ? (
            <Stack gap="xs">
              
              <ScrollArea h={160}>
                <Paper p="sm" bg="var(--mantine-color-blue-0)" radius="sm">
                  <Stack gap={4}>
                    {item.logs.skipped_events!.map((msg, i) => (
                      <Text key={i} size="xs" c="blue" ff="monospace">
                        {msg}
                      </Text>
                    ))}
                  </Stack>
                </Paper>
              </ScrollArea>
            </Stack>
          ) : (
            <Text size="xs" c="dimmed">
              Нет (для старых загрузок данные не сохранялись).
            </Text>
          )}

          {!hasErrors && (
            <Text size="xs" c="dimmed">
              Ошибок парсинга не обнаружено.
            </Text>
          )}
        </Stack>
      </Accordion.Panel>
    </Accordion.Item>
  );
}

export function ImportHistoryPage() {
  const { data, isLoading, isError } = useImportHistory();

  if (isLoading) return <Skeleton height={400} />;
  if (isError)
    return (
      <Alert icon={<IconAlertCircle size={16} />} color="brand" variant="light">
        Ошибка загрузки истории
      </Alert>
    );

  return (
    <Stack gap="lg">
      <Title order={2}>История загрузок</Title>

      {!data || data.length === 0 ? (
        <Paper
          p="xl"
          withBorder
          ta="center"
          radius="md"
          style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-card)' }}
        >
          <Text c="dimmed">Файлы ещё не загружались</Text>
        </Paper>
      ) : (
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
          <Accordion chevronPosition="right" variant="separated" multiple>
            {data.map((item) => (
              <HistoryAccordionItem key={item.id} item={item} />
            ))}
          </Accordion>
        </Paper>
      )}
    </Stack>
  );
}
