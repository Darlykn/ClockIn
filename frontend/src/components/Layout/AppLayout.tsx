import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppShell,
  Burger,
  Group,
  NavLink,
  Text,
  ActionIcon,
  Avatar,
  Menu,
  Divider,
  Badge,
  Box,
  useMantineColorScheme,
  useComputedColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconDashboard,
  IconCalendar,
  IconUsers,
  IconUpload,
  IconHistory,
  IconSun,
  IconMoon,
  IconLogout,
  IconChevronDown,
} from '@tabler/icons-react';
import { useAuth } from '../../providers/AuthProvider';
import { useLogout } from '../../hooks/useAuth';
import type { ReactNode } from 'react';

const NAV_ITEMS = [
  {
    path: '/dashboard',
    label: 'Статистика',
    icon: IconDashboard,
    roles: ['admin', 'manager', 'employee'],
  },
  {
    path: '/calendar',
    label: 'Календарь',
    icon: IconCalendar,
    roles: ['admin', 'manager', 'employee'],
  },
  {
    path: '/users',
    label: 'Сотрудники',
    icon: IconUsers,
    roles: ['admin', 'manager'],
  },
  {
    path: '/upload',
    label: 'Загрузка файлов',
    icon: IconUpload,
    roles: ['admin'],
  },
  {
    path: '/history',
    label: 'История загрузок',
    icon: IconHistory,
    roles: ['admin', 'manager'],
  },
];

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const [opened, { toggle }] = useDisclosure();
  const { user } = useAuth();
  const logout = useLogout();
  const navigate = useNavigate();
  const location = useLocation();
  const { toggleColorScheme } = useMantineColorScheme();
  const colorScheme = useComputedColorScheme('light');
  const [menuOpened, setMenuOpened] = useState(false);

  const filteredNav = NAV_ITEMS.filter(
    (item) => user && item.roles.includes(user.role)
  );

  const handleLogout = async () => {
    await logout.mutateAsync();
    navigate('/login');
  };

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 220, breakpoint: 'sm', collapsed: { mobile: !opened } }}
      padding="md"
      styles={{
        main: {
          backgroundColor: 'var(--bg-page)',
        },
      }}
    >
      <AppShell.Header
        style={{
          backgroundColor: 'var(--bg-card)',
          borderBottomColor: 'var(--border-subtle)',
        }}
      >
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text fw={700} size="lg" style={{ color: 'var(--primary-500)' }}>
              AttendTrack
            </Text>
          </Group>

          <Group gap="sm">
            <ActionIcon
              variant="subtle"
              color="gray"
              onClick={toggleColorScheme}
              title="Переключить тему"
              size="lg"
            >
              {colorScheme === 'dark' ? (
                <IconSun size={18} />
              ) : (
                <IconMoon size={18} />
              )}
            </ActionIcon>

            <Menu
              opened={menuOpened}
              onChange={setMenuOpened}
              position="bottom-end"
            >
              <Menu.Target>
                <Group gap="xs" style={{ cursor: 'pointer' }}>
                  <Avatar radius="xl" size="sm" color="brand">
                    {user?.full_name?.charAt(0).toUpperCase() ?? 'U'}
                  </Avatar>
                  <Text size="sm" visibleFrom="sm" c="var(--text-default)">
                    {user?.full_name}
                  </Text>
                  <Badge size="xs" variant="light" color="brand" visibleFrom="sm">
                    {user?.role}
                  </Badge>
                  <IconChevronDown size={14} />
                </Group>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconLogout size={16} />}
                  color="brand"
                  onClick={handleLogout}
                >
                  Выйти
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar
        p="xs"
        style={{
          backgroundColor: 'var(--bg-sidebar)',
          borderRightColor: 'var(--border-subtle)',
        }}
      >
        <AppShell.Section grow mt="xs">
          {filteredNav.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Box key={item.path} mb={4} style={{ position: 'relative' }}>
                {isActive && (
                  <Box
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: '4px',
                      bottom: '4px',
                      width: '3px',
                      borderRadius: '0 3px 3px 0',
                      backgroundColor: 'var(--primary-500)',
                      zIndex: 1,
                    }}
                  />
                )}
                <NavLink
                  label={item.label}
                  leftSection={<item.icon size={18} />}
                  active={isActive}
                  onClick={() => {
                    navigate(item.path);
                    toggle();
                  }}
                  color="brand"
                  variant="light"
                  style={
                    isActive
                      ? {
                          color: 'var(--primary-600)',
                          paddingLeft: 'calc(var(--mantine-spacing-sm) + 5px)',
                        }
                      : undefined
                  }
                />
              </Box>
            );
          })}
        </AppShell.Section>
        <AppShell.Section>
          <Divider my="xs" color="var(--border-subtle)" />
          <Text size="xs" c="dimmed" px="sm" pb="sm">
            v1.0.0
          </Text>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
