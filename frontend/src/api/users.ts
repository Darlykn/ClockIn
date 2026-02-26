import api from './client';
import type { User, UserRole, Employee } from '../types';

export interface UserCreatePayload {
  username: string;
  full_name: string;
  password: string;
  role: UserRole;
  email?: string;
}

export interface UserUpdatePayload {
  role?: UserRole;
  is_active?: boolean;
  email?: string;
  reset_2fa?: boolean;
}

export interface PaginatedUsers {
  total: number;
  page: number;
  per_page: number;
  pages: number;
  items: User[];
}

export const usersApi = {
  list: (search?: string) =>
    api
      .get<PaginatedUsers>('/users/', { params: { per_page: 500, ...(search ? { search } : {}) } })
      .then((r) => r.data.items),

  create: (payload: UserCreatePayload) =>
    api.post<User>('/users/', payload).then((r) => r.data),

  update: (id: string, payload: UserUpdatePayload) =>
    api.patch<User>(`/users/${id}`, payload).then((r) => r.data),

  listEmployees: () =>
    api.get<Employee[]>('/users/employees').then((r) => r.data),

  generateInvite: (id: string) =>
    api.post<{ invite_token: string }>(`/users/${id}/generate-invite`).then((r) => r.data),
};
