/** Remove PDF-only formatting from labels shown to users. */
export function displayRowLabel(label: string) {
  return label
    .replace(/^(?:-|–|—)\s+/, "")
    .replace(/(?:\s*\.){2,}\s*$/, "")
    .replace(/;\s*[\d,]+\s+shares\s+(?:authorized|issued)\b.*$/i, "")
    .trim();
}
