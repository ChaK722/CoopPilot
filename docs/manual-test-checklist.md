# CoopPilot manual test checklist

Run this checklist against a local production build (`npm run build` +
`npm run start`) or the deployed environment. Playwright covers the same
flows automatically in `tests/e2e/`; this checklist is for human
verification and for the production smoke test.

## Authentication

- [ ] Sign up with a new email; the session lands on onboarding.
- [ ] Complete onboarding with only a preferred name (other fields optional).
- [ ] Log out; protected routes redirect to `/login?next=...`.
- [ ] Log in again; session persists across refresh.
- [ ] Wrong password shows a friendly error, never a stack trace.

## Add job

- [ ] Paste a job description; Analyze runs in Demo Mode and shows
      "Demo AI Response".
- [ ] Correct at least one extracted field, then Save.
- [ ] Manual entry works without analysis (Skip analysis, enter manually).
- [ ] Repeated Analyze clicks create one review; double-saving creates one
      application.

## Track

- [ ] Board shows seven columns with counts; cards link to Job Detail.
- [ ] Status selector moves a card and appends history; Applied prompts for
      an optional date with Save/Skip/Cancel.
- [ ] Keyboard drag (focus handle, arrow keys, space) moves a card.
- [ ] Notes autosave shows Saving then Saved; a failed save never says Saved.
- [ ] Archive hides the application everywhere; restore returns it.
- [ ] Delete asks for confirmation; Cancel keeps everything; Confirm removes
      the record and its dependents.

## AI features (Demo Mode)

- [ ] Match analysis shows a score, breakdown, evidence, and Demo label.
- [ ] Cover letter generates, edits to Version 2, copies, restores v1, and
      warns before regenerating an edited version.
- [ ] Interview prep generates behavioural, technical, and research sections.
- [ ] Insufficient profile data produces an actionable prompt.
- [ ] Board shows `Match: n/100` only when a score exists.

## Dashboard and analytics

- [ ] Seven summary cards reconcile with the applications list.
- [ ] Archived applications disappear from every metric and list.
- [ ] A rejected application that reached Interview still counts as
      Interview; a withdrawn one that reached Offer still counts as Offer.
- [ ] Rates show `—` and "No applied applications yet" with no applications.
- [ ] `/analytics` matches `/dashboard`.

## Responsive and accessibility

- [ ] No horizontal overflow at 375 / 768 / 1280 px on any route.
- [ ] Skip to main content works with the keyboard.
- [ ] Every form is completable with the keyboard; dialogs trap focus and
      restore it on close.
- [ ] Theme System/Light/Dark persists across refresh.

## Error handling

- [ ] Killing the local backend shows a safe error card with a Reference ID,
      and retry works after the backend returns.
- [ ] Error toasts include `(Reference: ...)` and never show raw SQL,
      stack traces, or secrets.
