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
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text fw={700} size="lg" c="blue">
              AttendTrack
            </Text>
          </Group>

          <Group gap="sm">
            <ActionIcon
              variant="subtle"
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
                  <Avatar radius="xl" size="sm" color="blue">
                    {user?.full_name?.charAt(0).toUpperCase() ?? 'U'}
                  </Avatar>
                  <Text size="sm" visibleFrom="sm">
                    {user?.full_name}
                  </Text>
                  <Badge size="xs" variant="light" visibleFrom="sm">
                    {user?.role}
                  </Badge>
                  <IconChevronDown size={14} />
                </Group>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<IconLogout size={16} />}
                  color="red"
                  onClick={handleLogout}
                >
                  Выйти
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <AppShell.Section grow mt="xs">
          {filteredNav.map((item) => (
            <NavLink
              key={item.path}
              label={item.label}
              leftSection={<item.icon size={18} />}
              active={location.pathname === item.path}
              onClick={() => {
                navigate(item.path);
                toggle();
              }}
              variant="filled"
              mb={4}
            />
          ))}
        </AppShell.Section>
        <AppShell.Section>
          <Divider my="xs" />
          <Text size="xs" c="dimmed" px="sm" pb="sm">
            v1.0.0
          </Text>
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
