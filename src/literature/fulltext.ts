// Full text sent to the model: the reference list is dropped (it is long and never needed for extraction,
// appraisal or eligibility), and what remains is capped.

const REF_HEADING = /\b(?:References|REFERENCES|Bibliography|BIBLIOGRAPHY|Literature cited|LITERATURE CITED|Reference list)\b/g

/** Removes the reference list when one is found in the second half of the text (followed by citation-like entries). */
export function withoutReferences(text: string): string {
  let cut = -1
  for (const m of text.matchAll(REF_HEADING)) {
    if (m.index < text.length * 0.5) continue
    const next = text.slice(m.index, m.index + 600)
    if ((next.match(/\b(?:19|20)\d{2}\b/g) ?? []).length >= 3) cut = m.index
  }
  return cut > 0 ? text.slice(0, cut).trimEnd() : text
}

/** Body text for a prompt: no reference list, collapsed whitespace, at most `max` characters. */
export function fullTextForPrompt(text: string, max: number): { text: string; truncated: boolean } {
  const body = withoutReferences(text).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n')
  return { text: body.slice(0, max), truncated: body.length > max }
}
