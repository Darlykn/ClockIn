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
  Badge,
  Box,
  Tooltip,
  useMantineColorScheme,
  useComputedColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconDashboard,
  IconUsers,
  IconUpload,
  IconHistory,
  IconSun,
  IconMoon,
  IconLogout,
  IconChevronDown,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
} from '@tabler/icons-react';
import { useAuth } from '../../providers/AuthProvider';
import { useLogout } from '../../hooks/useAuth';
import type { ReactNode } from 'react';

const SIDEBAR_FULL = 220;
const SIDEBAR_MINI = 60;

const NAV_ITEMS = [
  {
    path: '/dashboard',
    label: 'Статистика',
    icon: IconDashboard,
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
  const [collapsed, setCollapsed] = useState(false);
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

  const sidebarWidth = collapsed ? SIDEBAR_MINI : SIDEBAR_FULL;

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: sidebarWidth,
        breakpoint: 'sm',
        collapsed: { mobile: !opened },
      }}
      padding="md"
      styles={{
        main: {
          backgroundColor: 'var(--bg-page)',
          transition: 'padding-left 200ms ease',
        },
        navbar: {
          transition: 'width 200ms ease, min-width 200ms ease',
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
          <Group gap="xs">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text fw={700} size="lg" style={{ color: 'var(--primary-500)', whiteSpace: 'nowrap' }}>
              {collapsed ? 'A' : 'AttendTrack'}
            </Text>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="md"
              visibleFrom="sm"
              onClick={() => setCollapsed((c) => !c)}
            >
              {collapsed ? (
                <IconLayoutSidebarLeftExpand size={16} />
              ) : (
                <IconLayoutSidebarLeftCollapse size={16} />
              )}
            </ActionIcon>
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
        style={{
          backgroundColor: 'var(--bg-sidebar)',
          borderRightColor: 'var(--border-subtle)',
          overflow: 'hidden',
          padding: collapsed ? '8px 4px' : '8px',
          transition: 'width 200ms ease, min-width 200ms ease, padding 200ms ease',
        }}
      >
        <AppShell.Section grow mt="xs">
          {filteredNav.map((item) => {
            const isActive = location.pathname === item.path;

            if (collapsed) {
              return (
                <Tooltip key={item.path} label={item.label} position="right" withArrow>
                  <Box
                    mb={4}
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                    }}
                  >
                    <ActionIcon
                      variant={isActive ? 'light' : 'subtle'}
                      color={isActive ? 'brand' : 'gray'}
                      size={40}
                      radius="md"
                      onClick={() => navigate(item.path)}
                    >
                      <item.icon size={20} />
                    </ActionIcon>
                  </Box>
                </Tooltip>
              );
            }

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
                    if (opened) toggle();
                  }}
                  color="brand"
                  variant="light"
                  style={{
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    ...(isActive
                      ? {
                          color: 'var(--primary-600)',
                          paddingLeft: 'calc(var(--mantine-spacing-sm) + 5px)',
                        }
                      : {}),
                  }}
                />
              </Box>
            );
          })}
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>{children}</AppShell.Main>
    </AppShell>
  );
}
