import posthog from 'posthog-js';

// Product analytics (PostHog). Everything here is a no-op until
// VITE_POSTHOG_KEY is set, so local dev and preview builds send nothing.
//
// Privacy rule for callers: never pass email, name, GPA, resume content or
// any other profile field as an event/person property. The only identifier
// we send is the Supabase user id; `school` is the only person property.

let initialized = false;

export function initAnalytics(): void {
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  if (!key || initialized || typeof window === 'undefined') return;

  posthog.init(key, {
    api_host: (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com',
    person_profiles: 'identified_only',
    // SPA: record a pageview on every client-side route change, nothing else
    // automatically.
    capture_pageview: 'history_change',
    capture_pageleave: false,
    autocapture: false,
    rageclick: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    disable_session_recording: true,
    disable_surveys: true,
  });
  initialized = true;
}

export function track(event: string, props?: Record<string, unknown>): void {
  if (!initialized) return;
  posthog.capture(event, props);
}

export function identify(userId: string, props?: { school?: string }): void {
  if (!initialized) return;
  posthog.identify(userId, props?.school ? { school: props.school } : undefined);
}

export function resetAnalytics(): void {
  if (!initialized) return;
  posthog.reset();
}
