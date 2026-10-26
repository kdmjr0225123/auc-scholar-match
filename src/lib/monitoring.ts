import * as Sentry from '@sentry/react';
import { scrubUrl } from './analytics';

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
    // Strip auth tokens from URLs (password-reset links put them in the hash).
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
    beforeBreadcrumb: (crumb) => {
      if (crumb.data) for (const k of ['from', 'to', 'url']) if (k in crumb.data) crumb.data[k] = scrubUrl(crumb.data[k]);
      return crumb;
    },
  });
}

export function captureError(error: unknown, componentStack?: string | null): void {
  if (!Sentry.isInitialized()) return;
  Sentry.captureException(error, componentStack ? { contexts: { react: { componentStack } } } : undefined);
}

function scrubEvent<T extends { request?: { url?: string }; transaction?: string }>(event: T): T {
  if (event.request?.url) event.request.url = scrubUrl(event.request.url) as string;
  if (event.transaction) event.transaction = scrubUrl(event.transaction) as string;
  return event;
}
