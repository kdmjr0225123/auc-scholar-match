// Retired 2026-10-26. Superseded by the daily digest, which reports pipeline
// health from pipeline_logs. This endpoint was unauthenticated and wrote rows to
// `incidents` on every call; kept as a stub so the URL is inert.
Deno.serve(() =>
  new Response(JSON.stringify({ error: "Gone. See the daily digest." }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  })
);
