import React from 'react';
import ReactDOM from 'react-dom/client';
import { MantineProvider, createTheme } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import App from './App';

const theme = createTheme({ primaryColor: 'dark', defaultRadius: 'md', fontFamily: 'Inter, system-ui, sans-serif' });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider theme={theme}>
      <Notifications position="top-center" />
      <App />
    </MantineProvider>
  </React.StrictMode>,
);
