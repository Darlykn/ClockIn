import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Center,
  Divider,
  Group,
  Image,
  LoadingOverlay,
  Modal,
  Paper,
  PasswordInput,
  PinInput,
  Stack,
  Text,
  TextInput,
  Title,
  Alert,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconKey } from '@tabler/icons-react';
import { useAuth } from '../providers/AuthProvider';
import { authApi } from '../api/auth';

type LoginStep = 'credentials' | 'setup2fa' | 'verify2fa';

interface FormValues {
  username: string;
  password: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const { login, setupTOTP, verifyTOTP } = useAuth();

  const [step, setStep] = useState<LoginStep>('credentials');
  const [tempToken, setTempToken] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [resetOpened, setResetOpened] = useState(false);
  const [resetForm, setResetForm] = useState({
    username: '',
    otp_code: '',
    new_password: '',
  });

  const form = useForm<FormValues>({
    initialValues: { username: '', password: '' },
    validate: {
      username: (v) => (!v ? 'Введите логин' : null),
      password: (v) => (!v ? 'Введите пароль' : null),
    },
  });

  const handleCredentials = async (values: FormValues) => {
    setError('');
    setLoading(true);
    try {
      const resp = await login(values);
      const token = resp.temp_token ?? '';
      if (resp.requires_2fa_setup) {
        setTempToken(token);
        const setup = await setupTOTP(token);
        setQrCode(setup.qr_code_uri);
        setTotpSecret(setup.secret);
        setStep('setup2fa');
      } else if (resp.requires_2fa_verify) {
        setTempToken(token);
        setStep('verify2fa');
      } else if (resp.access_token) {
        navigate('/dashboard', { replace: true });
      }
    } catch (err: unknown) {
      const e = err as { response?: { status?: number } };
      if (e?.response?.status === 401) {
        setError('Неверный логин или пароль');
      } else if (e?.response?.status === 403) {
        setError('Аккаунт заблокирован');
      } else {
        setError('Ошибка входа. Попробуйте позже.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (otpCode.length !== 6) return;
    setError('');
    setLoading(true);
    try {
      await verifyTOTP(otpCode, tempToken, totpSecret || undefined);
      navigate('/dashboard', { replace: true });
    } catch {
      setError('Неверный код. Попробуйте ещё раз.');
      setOtpCode('');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetForm.username || !resetForm.otp_code || !resetForm.new_password) return;
    try {
      await authApi.resetPassword(
        resetForm.username,
        resetForm.otp_code,
        resetForm.new_password
      );
      notifications.show({
        title: 'Успех',
        message: 'Пароль успешно изменён',
        color: 'green',
      });
      setResetOpened(false);
      setResetForm({ username: '', otp_code: '', new_password: '' });
    } catch {
      notifications.show({
        title: 'Ошибка',
        message: 'Неверный логин или OTP-код',
        color: 'red',
      });
    }
  };

  return (
    <Center h="100vh" style={{ background: 'var(--mantine-color-body)' }}>
      <Box w={420} pos="relative">
        <LoadingOverlay visible={loading} />

        <Paper p="xl" radius="lg" withBorder shadow="md">
          <Stack gap="lg">
            <Stack gap={4} align="center">
              <Title order={2} fw={700}>
                AttendTrack
              </Title>
              <Text c="dimmed" size="sm">
                {step === 'credentials' && 'Войдите в систему'}
                {step === 'setup2fa' && 'Настройка двухфакторной аутентификации'}
                {step === 'verify2fa' && 'Введите код из приложения'}
              </Text>
            </Stack>

            {error && (
              <Alert
                icon={<IconAlertCircle size={16} />}
                color="red"
                variant="light"
              >
                {error}
              </Alert>
            )}

            {step === 'credentials' && (
              <form onSubmit={form.onSubmit(handleCredentials)}>
                <Stack gap="md">
                  <TextInput
                    label="Логин"
                    placeholder="username"
                    {...form.getInputProps('username')}
                    autoFocus
                  />
                  <PasswordInput
                    label="Пароль"
                    placeholder="••••••••"
                    {...form.getInputProps('password')}
                  />
                  <Button type="submit" fullWidth size="md">
                    Войти
                  </Button>
                </Stack>
              </form>
            )}

            {step === 'setup2fa' && (
              <Stack gap="md" align="center">
                <Text size="sm" ta="center">
                  Отсканируйте QR-код в{' '}
                  <Text span fw={600}>
                    Yandex Key
                  </Text>{' '}
                  или{' '}
                  <Text span fw={600}>
                    Google Authenticator
                  </Text>
                </Text>
                {qrCode && (
                  <Image
                    src={qrCode}
                    alt="QR Code"
                    w={200}
                    h={200}
                    radius="md"
                  />
                )}
                <Text size="sm">Введите 6-значный код из приложения:</Text>
                <PinInput
                  length={6}
                  type="number"
                  value={otpCode}
                  onChange={setOtpCode}
                  oneTimeCode
                />
                <Button
                  fullWidth
                  size="md"
                  onClick={handleVerify}
                  disabled={otpCode.length !== 6}
                  leftSection={<IconKey size={16} />}
                >
                  Подтвердить
                </Button>
              </Stack>
            )}

            {step === 'verify2fa' && (
              <Stack gap="md" align="center">
                <Text size="sm" ta="center">
                  Введите код из приложения аутентификации
                </Text>
                <PinInput
                  length={6}
                  type="number"
                  value={otpCode}
                  onChange={setOtpCode}
                  oneTimeCode
                  autoFocus
                />
                <Button
                  fullWidth
                  size="md"
                  onClick={handleVerify}
                  disabled={otpCode.length !== 6}
                  leftSection={<IconKey size={16} />}
                >
                  Подтвердить
                </Button>
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={() => {
                    setStep('credentials');
                    setOtpCode('');
                    setError('');
                  }}
                >
                  Назад
                </Button>
              </Stack>
            )}

            {step === 'credentials' && (
              <>
                <Divider />
                <Group justify="center">
                  <Button
                    variant="subtle"
                    size="sm"
                    onClick={() => setResetOpened(true)}
                  >
                    Забыли пароль?
                  </Button>
                </Group>
              </>
            )}
          </Stack>
        </Paper>
      </Box>

      <Modal
        opened={resetOpened}
        onClose={() => setResetOpened(false)}
        title="Сброс пароля"
        centered
      >
        <Stack gap="md">
          <TextInput
            label="Логин"
            placeholder="username"
            value={resetForm.username}
            onChange={(e) =>
              setResetForm((p) => ({ ...p, username: e.target.value }))
            }
          />
          <TextInput
            label="OTP-код"
            placeholder="123456"
            value={resetForm.otp_code}
            onChange={(e) =>
              setResetForm((p) => ({ ...p, otp_code: e.target.value }))
            }
          />
          <PasswordInput
            label="Новый пароль"
            placeholder="••••••••"
            value={resetForm.new_password}
            onChange={(e) =>
              setResetForm((p) => ({ ...p, new_password: e.target.value }))
            }
          />
          <Button fullWidth onClick={handleResetPassword}>
            Сбросить пароль
          </Button>
        </Stack>
      </Modal>
    </Center>
  );
}
