/* Listing names are attacker-controlled -- $5 buys one -- and they end up pasted
   verbatim into a post published from the operator's own X account. Escaping is
   not enough at that sink: anything that could tag a stranger, link somewhere,
   or restructure the post is stripped outright, then hard-capped.

   Kept in its own module so the marketing robot and its tests can share it:
   daily-post.mjs runs its whole flow at import time, so it cannot be imported. */
export function safeName(raw) {
  const n = String(raw || "")
    .replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, " ")   // newlines + control chars
    .replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, "")   // zero-width + bidi
    .replace(/https?:\/\/\S+/gi, "")                      // explicit links
    .replace(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b\S*/gi, "")   // bare domains
    .replace(/[@#$]/g, "")                                // mentions, hashtags, cashtags
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30);
  return n || "Anonymous";
}
