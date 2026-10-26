// Retired 2026-10-26. This job hard-deleted any live scholarship that failed a
// single check (it removed Boren over a transient HTTP 502 on 2026-10-25), could
// re-activate rows without the pre-publish gate, and had no authentication.
// Live scholarships are now re-checked every morning by `scholarship-audit`,
// which only deactivates (never deletes) on a hard failure: deadline passed,
// dead link, ineligible, lead-gen or malware. Kept as a stub so the URL is inert.
Deno.serve(() =>
  new Response(JSON.stringify({ error: "Gone. Live checks run in scholarship-audit." }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  })
);
