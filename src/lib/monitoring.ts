import * as Sentry from '@sentry/react';

// Error tracking (Sentry). No-op until VITE_SENTRY_DSN is set.
// sendDefaultPii stays off: no IP addresses, cookies or user emails.

export function initMonitoring(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn || Sentry.isInitialized()) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
  });
}

export function captureError(error: unknown, componentStack?: string | null): void {
  if (!Sentry.isInitialized()) return;
  Sentry.captureException(error, componentStack ? { contexts: { react: { componentStack } } } : undefined);
}
