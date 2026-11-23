/**
 * "Did you mean" suggestions for the produce search, like a search engine's autocomplete.
 *
 * Every candidate word gets a score from the first rule that fits, best first:
 *   1. starts with what you typed            "app"  -> apple            (100)
 *   2. a later word starts with it           "des"  -> Tomato, Desi     (80)
 *   3. contains it                           "ato"  -> potato           (60)
 *   4. letters appear in order (skipping)    "apl"  -> apple            (40)
 *   5. a typo away (edit distance <= 1 or 2) "tomatto" -> tomato        (20)
 * Shorter words win ties (closer to what you typed), then alphabetical.
 */
export interface Suggestion {
  text: string
  score: number
}

const ACCENTS = new RegExp('[\\u0300-\\u036f]', 'g')
const NOT_WORD = /[^\p{L}\p{M}\p{N} ]+/gu

export const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(ACCENTS, '').replace(NOT_WORD, ' ').replace(/\s+/g, ' ').trim()

/** True when every letter of `q` appears in `word` in the same order ("apl" in "apple"). */
function isSubsequence(q: string, word: string) {
  let i = 0
  for (const ch of word) if (ch === q[i] && ++i === q.length) return true
  return q.length === 0
}

/** Levenshtein distance, stopping early once it is certainly above `max`. */
export function editDistance(a: string, b: string, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1))
      best = Math.min(best, cur[j]!)
    }
    if (best > max) return max + 1
    prev = cur
  }
  return prev[b.length]!
}

function scoreOf(q: string, candidate: string): number {
  const text = normalize(candidate)
  if (!text) return 0
  if (text.startsWith(q)) return 100
  const words = text.split(' ')
  if (words.some((w) => w.startsWith(q))) return 80
  if (text.includes(q)) return 60
  if (q.length >= 3 && words.some((w) => isSubsequence(q, w))) return 40
  // Typos: compare with the start of each word (so "tomatto" still finds "tomato").
  if (q.length >= 4) {
    const allowed = q.length >= 7 ? 2 : 1
    for (const w of words) {
      if (editDistance(q, w.slice(0, q.length + 1), allowed) <= allowed) return 20
      if (editDistance(q, w, allowed) <= allowed) return 20
    }
  }
  return 0
}

/** Best matches for `input` from `vocabulary`, deduplicated by spelling, at most `limit`. */
export function suggest(input: string, vocabulary: readonly string[], limit = 6): Suggestion[] {
  const q = normalize(input)
  if (q.length < 2) return []
  const seen = new Set<string>()
  const out: Suggestion[] = []
  for (const candidate of vocabulary) {
    const key = normalize(candidate)
    if (!key || seen.has(key) || key === q) continue
    seen.add(key)
    const score = scoreOf(q, candidate)
    if (score > 0) out.push({ text: candidate, score })
  }
  return out
    .sort((a, b) => b.score - a.score || a.text.length - b.text.length || a.text.localeCompare(b.text))
    .slice(0, limit)
}
