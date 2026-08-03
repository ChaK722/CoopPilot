# Production smoke test

Status: **NOT RUN — credentials unavailable.**

The production smoke test requires a live Vercel public URL and a managed
Supabase project. No Vercel CLI session, Supabase CLI session, production
project reference, or production environment variables exist in the current
environment, so this document records the procedure that must be executed
when credentials become available.

## Procedure (when authorized)

Use a temporary user and a second temporary user for isolation. Test data is
cleaned up after the run; never record passwords, tokens, service-role keys,
cookies, or JWTs in the results.

1. Public URL loads over HTTPS.
2. Signup/login works against the production Supabase project.
3. Onboarding completes with only a preferred name.
4. Add/analyze/review/save a job in Demo Mode; "Demo AI Response" is
   visible.
5. Change status from the board (with the Applied date prompt).
6. Generate match, cover letter (generate/edit), and interview prep.
7. Dashboard and `/analytics` reconcile with the created data.
8. Archive and restore the application.
9. Logout/login persistence.
10. Second user cannot see or open the first user's data (UI + direct REST
    with the second user's token returns no rows).
11. Responsive check at 375/768/1280 px; keyboard core path; axe
    serious/critical = 0; zero console/hydration errors.
12. Secret-exposure check: browser bundle/network contain no service-role
    key, JWT secret, or AI key.

## Result record (fill in when executed)

| Item                      | Value |
| ------------------------- | ----- |
| Date/time                 | —     |
| Commit SHA                | —     |
| Deployment ID             | —     |
| Public URL                | —     |
| Migration version applied | —     |
| Browser                   | —     |
| Steps/results             | —     |
| Residual warnings         | —     |

## Demo Mode

No `AI_API_KEY` is configured; the deterministic Demo provider is the only
implemented provider. Demo outputs are visibly labeled.
