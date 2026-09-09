# Elevaid — Sync w/ Trav & Dallas
**Board bullet:** 08/31–09/06, "Sync w/ Trav + Dallas (get aligned)"

---

## Where we actually stand (as of last night)

v1 is launch-ready on the product side. Confirmed and fixed: a pipeline bug that had been silently deleting live scholarships for 2.5 months (root cause found and shipped), security hardening applied (git hygiene, RLS/RPC cleanup), and a new admin-facing "Coverage Check" monitor is live — it tracks, daily and on-demand, whether every student is matching at least 4 scholarships. 55 students registered, matching engine works end to end.

**The one real gap: inventory.** 4 active scholarships right now. The Notion resource this is meant to replace/upgrade had 150+ listed (even discounting expired ones, that's the bar people will unconsciously compare us to). Walking into SGA or org conversations with 4 undersells a product that otherwise already works. This is not a structural problem — the ingestion pipeline (`elevaid_pipeline.py`) is already built; getting inventory up is scoped as roughly a day of focused work, not a rebuild.

---

## Inventory ownership — update

KJ is taking the pipeline sprint personally this weekend rather than handing it straight to Dallas — `elevaid_pipeline.py` already exists, this is roughly a day of focused work, and it's too big/too high-stakes an ask to drop on someone in their first week. Target: comfortably clear of the 4-scholarship floor before the 09/14 rollout step (pick a real number on the call, e.g. 30–50+), checked against the live "Coverage Check" tab in `/admin` as the objective readout rather than a guess.

## Dallas (junior SWE onboarding) — proposed first week(s)

Deliberately not a fire drill. Give him a real 1-2 week runway to get oriented — repo walkthrough, understand the pipeline/staging/eligibility flow, small low-stakes tasks — before he's expected to own anything load-bearing. Once inventory is already healthy (KJ's weekend work), a great *second* project for Dallas is taking over ongoing pipeline maintenance/expansion so it doesn't fall solely on KJ long-term — but that's a handoff after he's found his footing, not a day-one assignment. Same instinct KJ was brought up on: give someone room to show why they belong before handing them the keys.

## Trav (visibility/marketing) — proposed adjustment to this week

Keep the board's 08/31–09/06 "reach out to SGA leaders" step, but make it relationship-only this week — no product walkthrough yet. If a number comes up, lead with the mechanism, not the count: automatic matching, every link validated before a student sees it, an application tracker, built by a Morehouse student for AUC students. That story holds up regardless of inventory size.

**Hold, don't cancel:** the 09/07–09/13 "reach out to 2 other orgs for visibility" and the 09/14–09/20 "shared SGA posts from all 3 schools" — both put the product in front of people who will see the scholarship count directly. Gate both behind inventory clearing the floor with real headroom.

---

## The one thing to leave this call with

A revised board: same dates, but with an explicit **inventory gate** inserted before the 09/14 rollout step — a number, and who owns hitting it (Dallas), checked against the live Coverage Check numbers rather than a guess. Visibility on schedule, supply not yet on schedule — fix that gap today, not after the org outreach has already started.
