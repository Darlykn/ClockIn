import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../providers/AuthProvider';
import type { LoginCredentials } from '../types';

export function useLogin() {
  const { login } = useAuth();
  return useMutation({
    mutationFn: (credentials: LoginCredentials) => login(credentials),
  });
}

export function useSetup2FA() {
  const { setupTOTP } = useAuth();
  return useMutation({
    mutationFn: (tempToken: string) => setupTOTP(tempToken),
  });
}

export function useVerify2FA() {
  const { verifyTOTP } = useAuth();
  return useMutation({
    mutationFn: ({ code, tempToken }: { code: string; tempToken: string }) =>
      verifyTOTP(code, tempToken),
  });
}

export function useLogout() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => logout(),
    onSettled: () => {
      queryClient.clear();
    },
  });
}
