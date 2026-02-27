import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { filesApi } from '../api/files';

export function useUploadFile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => filesApi.upload(file),
    onSuccess: (data) => {
      if (data.status === 'success') {
        notifications.show({
          title: 'Файл загружен',
          message: `Обработано: ${data.inserted_count} записей, пропущено: ${data.error_count}`,
          color: 'green',
        });
      } else if (data.status === 'partial') {
        notifications.show({
          title: 'Файл обработан с ошибками',
          message: `Вставлено: ${data.inserted_count}, ошибок: ${data.error_count}`,
          color: 'yellow',
        });
      }
      queryClient.invalidateQueries({ refetchType: 'all' });
    },
    onError: () => {
      notifications.show({
        title: 'Ошибка загрузки',
        message: 'Не удалось обработать файл. Проверьте формат.',
        color: 'red',
      });
    },
  });
}

export function useImportHistory() {
  return useQuery({
    queryKey: ['files', 'history'],
    queryFn: () => filesApi.getHistory(),
  });
}
