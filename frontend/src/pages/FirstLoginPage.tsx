import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Center,
  Image,
  LoadingOverlay,
  Paper,
  PasswordInput,
  PinInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertCircle, IconKey } from '@tabler/icons-react';
import { authApi } from '../api/auth';
import { useAuth } from '../providers/AuthProvider';

type Step = 'loading' | 'set-credentials' | 'setup2fa' | 'verify2fa';

interface CredentialsForm {
  email: string;
  password: string;
  password_confirm: string;
}

export function FirstLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setupTOTP, verifyTOTP } = useAuth();

  const inviteToken = searchParams.get('token') ?? '';

  const [step, setStep] = useState<Step>('loading');
  const [hasEmail, setHasEmail] = useState(false);
  const [userName, setUserName] = useState('');
  const [expired, setExpired] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const form = useForm<CredentialsForm>({
    initialValues: { email: '', password: '', password_confirm: '' },
    validate: {
      email: (v) => (!hasEmail && !v ? 'Введите email' : null),
      password: (v) => (v.length < 6 ? 'Минимум 6 символов' : null),
      password_confirm: (v, values) =>
        v !== values.password ? 'Пароли не совпадают' : null,
    },
  });

  // Validate invite token on mount
  useEffect(() => {
    if (!inviteToken) return;
    authApi.validateInvite(inviteToken).then((resp) => {
      if (!resp.valid) {
        setExpired(true);
        setStep('set-credentials');
        return;
      }
      setHasEmail(resp.has_email);
      if (resp.full_name) setUserName(resp.full_name);
      if (resp.email) form.setFieldValue('email', resp.email);
      setStep('set-credentials');
    }).catch(() => {
      setExpired(true);
      setStep('set-credentials');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteToken]);

  if (!inviteToken || expired) {
    return (
      <Center h="100vh" style={{ background: 'var(--bg-page)' }}>
        <Alert icon={<IconAlertCircle size={16} />} color="brand" variant="light" title="Ссылка недействительна">
          Ссылка для входа устарела.
          Запросите новую ссылку у администратора.
        </Alert>
      </Center>
    );
  }

  const handleSetCredentials = async (values: CredentialsForm) => {
    setError('');
    setLoading(true);
    try {
      const resp = await authApi.firstLogin(
        inviteToken,
        values.password,
        values.password_confirm,
        hasEmail ? undefined : values.email,
      );

      if (resp.access_token) {
        navigate('/dashboard', { replace: true });
        return;
      }

      const token = resp.temp_token ?? '';
      setTempToken(token);

      if (resp.requires_2fa_setup) {
        const setup = await setupTOTP(token);
        setQrCode(setup.qr_code_uri);
        setTotpSecret(setup.secret);
        setStep('setup2fa');
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string }; status?: number } };
      const detail = e?.response?.data?.detail;
      if (detail === 'Passwords do not match') {
        setError('Пароли не совпадают');
      } else if (detail === 'Invalid or expired invite link') {
        setError('Ссылка недействительна или устарела');
      } else {
        setError('Произошла ошибка. Попробуйте позже.');
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

  const stepLabel: Record<Step, string> = {
    'loading': 'Загрузка...',
    'set-credentials': hasEmail ? 'Установка пароля' : 'Создание аккаунта',
    'setup2fa': 'Настройка двухфакторной аутентификации',
    'verify2fa': 'Введите код из приложения',
  };

  return (
    <Center h="100vh" style={{ background: 'var(--bg-page)' }}>
      <Box w={420} pos="relative">
        <LoadingOverlay visible={loading || step === 'loading'} />

        <Paper
          p="xl"
          radius="lg"
          withBorder
          shadow="md"
          style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-card)' }}
        >
          <Stack gap="lg">
            <Stack gap={4} align="center">
              <Title order={2} fw={700} style={{ color: 'var(--primary-500)' }}>
                AttendTrack
              </Title>
              {userName && (
                <Text fw={500} size="md">
                  {userName}
                </Text>
              )}
              <Text c="dimmed" size="sm">
                {stepLabel[step]}
              </Text>
            </Stack>

            {error && (
              <Alert icon={<IconAlertCircle size={16} />} color="brand" variant="light">
                {error}
              </Alert>
            )}

            {step === 'set-credentials' && (
              <form onSubmit={form.onSubmit(handleSetCredentials)}>
                <Stack gap="md">
                  {!hasEmail && (
                    <TextInput
                      label="Email"
                      placeholder="ivanov@company.ru"
                      autoFocus
                      {...form.getInputProps('email')}
                    />
                  )}
                  <PasswordInput
                    label="Пароль"
                    placeholder="••••••••"
                    autoFocus={hasEmail}
                    {...form.getInputProps('password')}
                  />
                  <PasswordInput
                    label="Повторите пароль"
                    placeholder="••••••••"
                    {...form.getInputProps('password_confirm')}
                  />
                  <Button type="submit" fullWidth size="md" color="brand">
                    Продолжить
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
                  <Image src={qrCode} alt="QR Code" w={200} h={200} radius="md" />
                )}
                <Text size="sm">Введите 6-значный код из приложения:</Text>
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
                  color="brand"
                  onClick={handleVerify}
                  disabled={otpCode.length !== 6}
                  leftSection={<IconKey size={16} />}
                >
                  Подтвердить
                </Button>
              </Stack>
            )}
          </Stack>
        </Paper>
      </Box>
    </Center>
  );
}
