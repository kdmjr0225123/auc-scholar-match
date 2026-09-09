# Elevaid — Technical Handoff: Dallas

---

## What Exists

**Product:** Live at elevaid.pro. React/TypeScript + Vite frontend, Supabase backend, deployed on Vercel.

**Access already in place:**
- Repo (public): [github.com/kdmjr0225123/auc-scholar-match](https://github.com/kdmjr0225123/auc-scholar-match)
- Supabase project: `https://swvfmitxxjrjuizaqvsn.supabase.co`

**Current data (live, as of Sept 4, 2026):**

| Metric | Value |
|---|---|
| Registered students | 55 (Morehouse 41 / Spelman 8 / Clark Atlanta 4 / Morris Brown 2) |
| Active scholarships | 4 |
| Combined award value | $4,500 |
| Applications tracked | 0 |
| Match floor (Synthetic Coverage Check) | Every student ≥ 4 matches — currently exactly 4, no margin |

**Architecture map:**

| Area | Location |
|---|---|
| Student pages | `src/pages/` — Landing, Auth, ProfileSetup, Profile, Dashboard |
| Admin panel | `src/pages/Admin.tsx` + `src/components/admin/*` |
| Edge functions | `supabase/functions/` — `notify-new-scholarship`, `scholarship-reminders`, `scholarship-quality-check`, `maintenance-runner`, `score-and-validate`, `synthetic-coverage-check` |
| Core tables | `scholarships`, `eligibility_rules`, `student_profiles`, `scholarship_staging`, `pipeline_logs`, `pipeline_runs`, `user_roles`, `synthetic_profiles`, `synthetic_coverage_runs`, `synthetic_coverage_results` |
| Migrations | `supabase/migrations/` (chronological changelog) |
| Ingestion pipeline | `elevaid_pipeline.py`, sibling folder `elevaid-pipeline` |

**Automated systems in production:**

| Time (UTC) | Job |
|---|---|
| Midnight daily | Expired scholarships auto-deactivated |
| 8:00am daily | `scholarship-quality-check` — link validation, CAPTCHA/broken-link detection |
| 8:15am daily | `synthetic-coverage-check` — 16 canary profiles re-scored against live matching logic |
| 9:00am daily | Deadline reminder emails (7-day + 2-day) via Resend |
| On insert | `notify-new-scholarship` — emails matching students |

**Known behavior, not a bug:** `Dashboard.tsx`'s `calculateMatches` hard-excludes on **school** and **graduation year** only. GPA and major affect displayed match % but never exclude a match. `synthetic-coverage-check` deliberately mirrors this. Do not "fix" one without the other.

**Recent history:**
- A 2.5-month pipeline bug silently deleted live scholarships (a new-candidate gate was wrongly applied to already-approved recheck runs). Found, fixed, confirmed.
- Security hardening pass completed: function `search_path` pinned, an over-broad RPC grant revoked.
- Application tracker + persistent resume upload shipped Aug 12.

---

## What's Needed

- [ ] Repo collaborator access — KJ to add you directly
- [ ] Supabase project access — KJ to add you as a project member (preferred over sharing static keys)
- [ ] Local `.env.local` (not committed — repo root):
  ```
  VITE_SUPABASE_PROJECT_ID="swvfmitxxjrjuizaqvsn"
  VITE_SUPABASE_URL="https://swvfmitxxjrjuizaqvsn.supabase.co"
  VITE_SUPABASE_PUBLISHABLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3dmZtaXR4eGpyanVpemFxdnNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NDYwNjUsImV4cCI6MjA4MTQyMjA2NX0.T2FsXrqs-5C-HGiL6YaMEx0JG_JTrSVdTro_zrBfY54"
  ```
  (This is the public anon key — safe outside secure channels, ships in the client bundle already.)
- **Service role key is NOT included above and must not be committed, Slacked, or placed in client-side code.** It only belongs in an edge function's server env or Supabase's own secret store. Delivered separately via project membership or a secure channel.
- Week 1: full repo read, run the app locally, trace the pipeline → staging → eligibility flow end-to-end.

---

## What's Expected of You

**First sprint (weeks 1–2):**
- Navigate the pipeline/staging/eligibility flow without assistance
- Understand what the Synthetic Coverage Check does and why it exists
- Be able to independently triage a broken-link or quarantine issue

**Not expected in week 1:** ownership of anything load-bearing. This is an onboarding runway, not a fire drill.

**Second project, once inventory clears the gate (see board):** take ownership of ongoing pipeline maintenance and expansion, so it no longer depends solely on KJ. This is a deliberate handoff after week 1–2, not a day-one assignment.

**Longer-term bar:** you own pipeline health — scholarships keep flowing in without depending on one person's weekend.

---

## How We'll Operate

- **2-week sprints** — scope set at the start of each
- **One weekly call**
- **Async written updates Monday / Wednesday / Friday** — what moved, what's blocked, what's next. A few sentences, not a report.
- Bring questions to async updates or the weekly call rather than sitting on them.

**Repo conventions (PowerShell):**
- Commands run one at a time — no `&&` chaining
- File writes via `[System.IO.File]::WriteAllText()`
- Always `cd` into the repo root first
- Git flow: `git add .` → `git commit -m "..."` → `git push` as separate steps
