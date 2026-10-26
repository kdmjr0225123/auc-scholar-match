import posthog from 'posthog-js';

// Product analytics (PostHog). Everything here is a no-op until
// VITE_POSTHOG_KEY is set, so local dev and preview builds send nothing.
//
// Privacy rule for callers: never pass email, name, GPA, resume content or
// any other profile field as an event/person property. The only identifier
// we send is the Supabase user id; `school` is the only person property.

let initialized = false;

// Password-reset and sign-in links carry tokens in the URL hash
// (#access_token=…&refresh_token=…). Never let a URL with a hash or auth
// query params leave the browser.
export function scrubUrl(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const noHash = value.split('#')[0];
  return noHash.replace(/([?&])(access_token|refresh_token|token|code|token_hash)=[^&]*/gi, '$1$2=redacted');
}
const URL_PROPS = ['$current_url', '$referrer', '$initial_current_url', '$initial_referrer', '$pathname'];

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
    before_send: (event) => {
      if (event?.properties) {
        for (const k of URL_PROPS) if (k in event.properties) event.properties[k] = scrubUrl(event.properties[k]);
      }
      if (event?.$set) for (const k of URL_PROPS) if (k in event.$set) event.$set[k] = scrubUrl(event.$set[k]);
      if (event?.$set_once) for (const k of URL_PROPS) if (k in event.$set_once) event.$set_once[k] = scrubUrl(event.$set_once[k]);
      return event;
    },
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
