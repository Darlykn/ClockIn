import { useRef, useState } from 'react';
import {
  Stack,
  Title,
  Paper,
  Text,
  Group,
  Progress,
  Badge,
  Alert,
  Button,
  SimpleGrid,
  Divider,
  ScrollArea,
  ThemeIcon,
} from '@mantine/core';
import { Dropzone } from '@mantine/dropzone';
import {
  IconUpload,
  IconX,
  IconFile,
  IconAlertCircle,
  IconCheck,
  IconDatabaseImport,
  IconCopy,
  IconAlertTriangle,
  IconPlayerSkipForward,
} from '@tabler/icons-react';
import { useUploadFile } from '../hooks/useUpload';
import type { UploadResult } from '../types';

function StatCard({
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
    <Paper p="sm" withBorder radius="md">
      <Group gap="sm" wrap="nowrap">
        <ThemeIcon color={color} variant="light" size="lg" radius="md">
          {icon}
        </ThemeIcon>
        <Stack gap={0}>
          <Text size="xs" c="dimmed">
            {label}
          </Text>
          <Text fw={700} size="lg" c={color}>
            {value}
          </Text>
        </Stack>
      </Group>
    </Paper>
  );
}

export function UploadPage() {
  const uploadMutation = useUploadFile();
  const [result, setResult] = useState<UploadResult | null>(null);
  const openRef = useRef<() => void>(null);

  const handleDrop = async (files: File[]) => {
    if (files.length === 0) return;
    setResult(null);
    const res = await uploadMutation.mutateAsync(files[0]).catch(() => null);
    if (res) setResult(res);
  };

  const statusColor =
    result?.status === 'success'
      ? 'green'
      : result?.status === 'partial'
      ? 'yellow'
      : 'red';

  const statusLabel =
    result?.status === 'success'
      ? 'Успех'
      : result?.status === 'partial'
      ? 'Частичный импорт'
      : 'Ошибка';

  return (
    <Stack gap="lg">
      <Title order={2}>Загрузка Excel-файла</Title>

      <Paper p="xl" withBorder radius="md">
        <Dropzone
          openRef={openRef}
          onDrop={handleDrop}
          accept={[
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel',
          ]}
          maxSize={10 * 1024 * 1024}
          loading={uploadMutation.isPending}
          disabled={uploadMutation.isPending}
        >
          <Group justify="center" gap="xl" mih={160} style={{ pointerEvents: 'none' }}>
            <Dropzone.Accept>
              <IconUpload size={52} color="var(--mantine-color-blue-6)" />
            </Dropzone.Accept>
            <Dropzone.Reject>
              <IconX size={52} color="var(--mantine-color-red-6)" />
            </Dropzone.Reject>
            <Dropzone.Idle>
              <IconFile size={52} color="var(--mantine-color-dimmed)" />
            </Dropzone.Idle>

            <Stack gap={4} align="center">
              <Text size="xl" fw={600}>
                Перетащите Excel-файл сюда
              </Text>
              <Text size="sm" c="dimmed">
                Поддерживаются форматы .xlsx и .xls (до 10 MB)
              </Text>
              <Button
                variant="light"
                size="sm"
                mt="sm"
                style={{ pointerEvents: 'all' }}
                onClick={() => openRef.current?.()}
              >
                Выбрать файл
              </Button>
            </Stack>
          </Group>
        </Dropzone>

        {uploadMutation.isPending && (
          <Progress value={100} animated mt="md" />
        )}
      </Paper>

      {result && (
        <Paper p="md" withBorder radius="md">
          <Stack gap="md">
            {/* Header */}
            <Group gap="sm" justify="space-between">
              <Group gap="sm">
                {result.status === 'success' ? (
                  <IconCheck size={20} color="var(--mantine-color-green-6)" />
                ) : result.status === 'partial' ? (
                  <IconAlertCircle size={20} color="var(--mantine-color-yellow-6)" />
                ) : (
                  <IconX size={20} color="var(--mantine-color-red-6)" />
                )}
                <Text fw={600} size="sm" c="dimmed" ff="monospace">
                  {result.filename}
                </Text>
              </Group>
              <Badge color={statusColor} size="md">
                {statusLabel}
              </Badge>
            </Group>

            <Divider />

            {/* Stats */}
            <SimpleGrid cols={{ base: 2, sm: 5 }} spacing="sm">
              <StatCard
                label="Всего строк"
                value={result.total}
                color="blue"
                icon={<IconFile size={16} />}
              />
              <StatCard
                label="Добавлено"
                value={result.inserted_count}
                color="green"
                icon={<IconDatabaseImport size={16} />}
              />
              <StatCard
                label="Дубликаты"
                value={result.skipped}
                color="gray"
                icon={<IconCopy size={16} />}
              />
              <StatCard
                label="Пропущено"
                value={result.skipped_events?.length ?? 0}
                color={(result.skipped_events?.length ?? 0) > 0 ? 'orange' : 'gray'}
                icon={<IconPlayerSkipForward size={16} />}
              />
              <StatCard
                label="Ошибки"
                value={result.error_count}
                color={result.error_count > 0 ? 'red' : 'gray'}
                icon={<IconAlertTriangle size={16} />}
              />
            </SimpleGrid>

            {/* Error list */}
            {result.errors && result.errors.length > 0 && (
              <Stack gap="xs">
                <Text size="sm" fw={600}>
                  Причины пропуска строк:
                </Text>
                <ScrollArea h={200}>
                  <Paper p="sm" bg="var(--mantine-color-red-0)" radius="sm">
                    <Stack gap={4}>
                      {result.errors.map((err, i) => (
                        <Text key={i} size="xs" c="red" ff="monospace">
                          {err}
                        </Text>
                      ))}
                    </Stack>
                  </Paper>
                </ScrollArea>
              </Stack>
            )}

            {/* Пропущенные системные события (нет входа - идентификатора нет в бд и т.п.) — всегда показываем секцию */}
            <Stack gap="xs">
              <Text size="sm" fw={600}>
                Пропущенные системные события (не добавлены в БД):
              </Text>
              {(result.skipped_events?.length ?? 0) > 0 ? (
                <ScrollArea h={180}>
                  <Paper p="sm" bg="var(--mantine-color-blue-0)" radius="sm">
                    <Stack gap={4}>
                      {result.skipped_events!.map((msg, i) => (
                        <Text key={i} size="xs" c="blue" ff="monospace">
                          {msg}
                        </Text>
                      ))}
                    </Stack>
                  </Paper>
                </ScrollArea>
              ) : (
                <Text size="xs" c="dimmed">
                  Нет (все обработанные строки — проходы или ошибки парсинга).
                </Text>
              )}
            </Stack>
          </Stack>
        </Paper>
      )}

      {uploadMutation.isError && !result && (
        <Alert
          icon={<IconAlertCircle size={16} />}
          color="red"
          title="Ошибка"
        >
          Не удалось обработать файл. Проверьте формат (только .xlsx/.xls).
        </Alert>
      )}
    </Stack>
  );
}
