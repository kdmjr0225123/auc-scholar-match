// Retired 2026-10-26. This endpoint emailed every matching student once per
// newly promoted scholarship and had no authentication. Student match email is
// now the batched, authenticated `match-digest` function (one email per student
// per day, one-click unsubscribe). Kept deployed as a stub so the URL can't be
// used to send mail.
Deno.serve(() =>
  new Response(JSON.stringify({ error: "Gone. Replaced by match-digest." }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  })
);
