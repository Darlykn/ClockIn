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
});

// Map Mantine built-in vars to our design tokens per color scheme
const resolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    '--mantine-color-body': '#F4F4F5',
    '--mantine-color-default-border': '#E2E2E2',
    '--mantine-color-dimmed': '#6B6B6F',
    '--mantine-color-text': '#2C2C2E',
  },
  dark: {
    '--mantine-color-body': '#0F172A',
    '--mantine-color-default-border': '#334155',
    '--mantine-color-dimmed': '#94A3B8',
    '--mantine-color-text': '#E2E8F0',
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
