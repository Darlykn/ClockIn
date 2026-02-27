import { MantineProvider, createTheme } from '@mantine/core';
import type { MantineColorsTuple, CSSVariablesResolver } from '@mantine/core';
import { DatesProvider } from '@mantine/dates';
import { Notifications } from '@mantine/notifications';
import type { ReactNode } from 'react';
import 'dayjs/locale/ru';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/dropzone/styles.css';

// Brand color ramp: primary-500 = index[5] = #C82339
const brandColors: MantineColorsTuple = [
  '#FCECED', // 0 - lightest tint
  '#F8CDD1', // 1
  '#F0A0A9', // 2
  '#E87080', // 3
  '#E45A6A', // 4 - primary-400
  '#C82339', // 5 - primary-500
  '#A81E30', // 6 - primary-600
  '#8C1928', // 7 - primary-700
  '#6E1320', // 8
  '#50000A', // 9 - darkest
];

const theme = createTheme({
  primaryColor: 'brand',
  colors: {
    brand: brandColors,
  },
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
  defaultRadius: 'md',
  radius: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
  },
  headings: {
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
    fontWeight: '700',
  },
  components: {
    Paper: {
      defaultProps: {
        radius: 'md',
      },
    },
    Modal: {
      styles: () => ({
        overlay: {
          backdropFilter: 'blur(4px)',
          background: 'var(--bg-overlay)',
        },
        content: {
          backgroundColor: 'var(--bg-elevated)',
          boxShadow: 'var(--shadow-lg)',
        },
      }),
    },
    Button: {
      styles: () => ({
        root: {
          fontWeight: 600,
          transition: 'all var(--transition-fast)',
        },
      }),
    },
    TextInput: {
      styles: () => ({
        input: {
          borderColor: 'var(--border-subtle)',
          transition: 'border-color var(--transition-fast)',
          '&:focus': {
            borderColor: 'var(--border-focus)',
          },
        },
      }),
    },
    PasswordInput: {
      styles: () => ({
        input: {
          borderColor: 'var(--border-subtle)',
          transition: 'border-color var(--transition-fast)',
          '&:focus': {
            borderColor: 'var(--border-focus)',
          },
        },
      }),
    },
    Select: {
      styles: () => ({
        input: {
          borderColor: 'var(--border-subtle)',
          transition: 'border-color var(--transition-fast)',
          '&:focus': {
            borderColor: 'var(--border-focus)',
          },
        },
      }),
    },
    Table: {
      styles: () => ({
        thead: {
          backgroundColor: 'var(--bg-inset)',
        },
      }),
    },
    Tooltip: {
      styles: () => ({
        tooltip: {
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-md)',
          color: 'var(--text-default)',
        },
      }),
    },
    Accordion: {
      styles: () => ({
        item: {
          backgroundColor: 'var(--bg-card)',
          transition: 'background-color var(--transition-fast)',
          '&:hover': {
            backgroundColor: 'var(--bg-card-hover)',
          },
        },
      }),
    },
    Notification: {
      styles: () => ({
        root: {
          backgroundColor: 'var(--bg-elevated)',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border-subtle)',
        },
      }),
    },
    Menu: {
      styles: () => ({
        dropdown: {
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-lg)',
        },
      }),
    },
    Dropzone: {
      styles: () => ({
        root: {
          borderColor: 'var(--border-subtle)',
          transition: 'border-color var(--transition-fast), background-color var(--transition-fast)',
          '&[data-accept]': {
            borderColor: 'var(--success-500)',
            backgroundColor: 'var(--success-50)',
          },
          '&[data-reject]': {
            borderColor: 'var(--error-500)',
            backgroundColor: 'var(--error-50)',
          },
        },
      }),
    },
  },
});

// Map Mantine built-in vars to our design tokens per color scheme
const resolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    '--mantine-color-body': '#F4F4F5',
    '--mantine-color-default-border': '#E2E2E2',
    '--mantine-color-dimmed': '#6B6B6F',
    '--mantine-color-text': '#2C2C2E',
    '--mantine-color-placeholder': '#9CA3AF',
  },
  dark: {
    '--mantine-color-body': '#0A0A0A',
    '--mantine-color-default-border': '#2A2A2A',
    '--mantine-color-dimmed': '#999999',
    '--mantine-color-text': '#E0E0E0',
    '--mantine-color-placeholder': '#666666',
  },
});

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  return (
    <MantineProvider theme={theme} cssVariablesResolver={resolver} defaultColorScheme="auto">
      <DatesProvider settings={{ locale: 'ru', firstDayOfWeek: 1 }}>
        <Notifications position="top-right" zIndex={9999} />
        {children}
      </DatesProvider>
    </MantineProvider>
  );
}
