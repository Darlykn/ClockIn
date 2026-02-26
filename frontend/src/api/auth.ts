import api from './client';
import type {
  LoginCredentials,
  LoginResponse,
  Setup2FAResponse,
  Verify2FAResponse,
  User,
} from '../types';

export const authApi = {
  login: (credentials: LoginCredentials) =>
    api.post<LoginResponse>('/auth/login', credentials).then((r) => r.data),

  setup2FA: (tempToken: string) =>
    api
      .post<Setup2FAResponse>(
        '/auth/2fa/setup',
        {},
        { headers: { Authorization: `Bearer ${tempToken}` } }
      )
      .then((r) => r.data),

  verify2FA: (code: string, tempToken: string, secret?: string) =>
    api
      .post<Verify2FAResponse>(
        '/auth/2fa/verify',
        { code, ...(secret ? { secret } : {}) },
        { headers: { Authorization: `Bearer ${tempToken}` } }
      )
      .then((r) => r.data),

  logout: () => api.post('/auth/logout').then((r) => r.data),

  getMe: () => api.get<User>('/users/me').then((r) => r.data),

  resetPassword: (username: string, otp_code: string, new_password: string) =>
    api
      .post('/auth/reset-password', { username, otp_code, new_password })
      .then((r) => r.data),

  firstLogin: (invite_token: string, email: string, password: string, password_confirm: string) =>
    api
      .post<LoginResponse>('/auth/first-login', {
        invite_token,
        email,
        password,
        password_confirm,
      })
      .then((r) => r.data),
};
