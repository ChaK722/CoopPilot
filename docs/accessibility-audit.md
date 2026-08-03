# Accessibility audit

Audit date: 2026-08-02. Tooling: Playwright + `@axe-core/playwright` on a
real Chromium against the production build.

## Automated results

- Axe serious/critical violations: **0** across:
  - Public pages: landing, login, signup.
  - Authenticated pages: dashboard, analytics, applications table, Add Job,
    board, job detail, profile, archive, settings, onboarding.
  - Destructive delete dialog.
  - Light and dark themes at 1280 px and 375 px.
- All minor/moderate findings are resolved; no rule exemptions are in use.

## Fixes applied during the audit

- Toast live region: added `role="status"` to the notifications container
  (removed `aria-prohibited-attr`).
- Light theme `--muted-foreground` darkened from 47% to 44% lightness so
  muted text on the background reaches ≥ 4.5:1.
- Sidebar active navigation and Settings theme radio selected states use
  `text-foreground` on the tinted background instead of `text-primary`
  (contrast 4.31→4.49 → passes).
- Success/checkmarks use `text-emerald-700` in light mode and
  `text-emerald-400` in dark mode (emerald-600 was 3.6:1 on light;
  emerald-700 alone was 3.51:1 on dark).
- Skip-to-main-content links added to protected, public, login, and signup
  layouts; `<main>` elements accept programmatic focus (`tabIndex={-1}`)
  so the skip link lands correctly.

## Keyboard verification

`tests/e2e/keyboard.spec.ts` completes signup, onboarding, navigation to Add
Job, and Settings theme selection using only the keyboard, plus the skip
link. Board unit tests verify the keyboard drag handle, dialog focus trap,
and focus restore. The Playwright suite runs at 1280 and 375 px widths.

## Semantics

- Landmarks: `main`, `nav`, `header`, and complementary sidebar regions.
- Charts use `figure`/`figcaption`, visible labels and values, and
  `aria-label` text alternatives; no hover-only values.
- Statuses include text labels in addition to color; icons are
  `aria-hidden`.
- Icons-only controls have accessible names; loading states disable buttons
  and show progress text.

## Console/hydration strictness

The E2E fixture fails tests on any unexpected `pageerror`, console error,
hydration warning, or failed request. Two precise, documented exceptions:

- `net::ERR_ABORTED` failed requests: the browser cancelled its own request
  because the page navigated away (Link clicks, `router.refresh`,
  redirects, cookie clearing). The server did not fail.
- Dev-only `/_next/webpack-hmr` websocket errors in the AI-failure project:
  the test browser cannot complete the HMR handshake on `next dev`; the
  production server used by every other project has no such endpoint.
- `favicon.ico` 404s are excluded as non-app resource noise.
