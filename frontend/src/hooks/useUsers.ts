import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notifications } from '@mantine/notifications';
import { usersApi, type UserCreatePayload, type UserUpdatePayload } from '../api/users';

export function useUsers(search?: string) {
  return useQuery({
    queryKey: ['users', search],
    queryFn: () => usersApi.list(search),
  });
}

export function useEmployees() {
  return useQuery({
    queryKey: ['employees'],
    queryFn: () => usersApi.listEmployees(),
    staleTime: 10 * 60 * 1000,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UserCreatePayload) => usersApi.create(payload),
    onSuccess: () => {
      notifications.show({
        title: 'Пользователь создан',
        message: 'Новый пользователь успешно добавлен',
        color: 'green',
      });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => {
      notifications.show({
        title: 'Ошибка',
        message: 'Не удалось создать пользователя',
        color: 'red',
      });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UserUpdatePayload }) =>
      usersApi.update(id, payload),
    onSuccess: () => {
      notifications.show({
        title: 'Пользователь обновлён',
        message: 'Данные пользователя успешно изменены',
        color: 'green',
      });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => {
      notifications.show({
        title: 'Ошибка',
        message: 'Не удалось обновить пользователя',
        color: 'red',
      });
    },
  });
}
