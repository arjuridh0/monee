const units: Record<string, number> = { nol: 0, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10, sebelas: 11, seratus: 100, seribu: 1000, sejuta: 1000000, setengah: 0.5 }
const word = '(?:nol|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|seratus|seribu|sejuta|setengah|belas|puluh|ratus|ribu|juta|miliar)'

function verbal(text: string): number {
  let total = 0, group = 0, last = 0
  for (const token of text.split(/\s+/)) {
    if (token === 'seribu' || token === 'sejuta') { total += token === 'seribu' ? 1000 : 1000000; last = 0 }
    else if (token === 'belas') group += 10
    else if (token === 'puluh' || token === 'ratus') { group += last * (token === 'puluh' ? 9 : 99); last = 0 }
    else if (['ribu', 'juta', 'miliar'].includes(token)) {
      total += (group || 1) * ({ ribu: 1000, juta: 1000000, miliar: 1000000000 }[token] ?? 1)
      group = 0
      last = 0
    } else { last = units[token] ?? 0; group += last }
  }
  return total + group
}

/** Returns every candidate, so ambiguous/malformed amounts can be rejected by the caller. */
export function findAmounts(text: string): number[] {
  const values: number[] = []
  const rest = text.replace(/(?:rp\s*)?[-+]?\d[\d.,]*(?:\s*(?:miliar|juta|ribu|jt|rb|k)\b)?/g, token => {
    const match = token.match(/^(?:rp\s*)?([-+]?\d[\d.,]*)\s*(miliar|juta|ribu|jt|rb|k)?$/)
    if (!match) return ' '
    const raw = match[1]!, suffix = match[2]
    const grouped = /^[-+]?\d{1,3}(?:\.\d{3})+$/.test(raw)
    const normalized = grouped ? raw.replace(/\./g, '') : raw.replace(',', '.')
    const multiplier = suffix ? ({ miliar: 1e9, juta: 1e6, jt: 1e6, ribu: 1000, rb: 1000, k: 1000 }[suffix] ?? 1) : 1
    values.push(Number(normalized) * multiplier)
    return ' '
  })
  for (const match of rest.matchAll(new RegExp(`\\b${word}(?:\\s+${word})*\\b`, 'g'))) values.push(verbal(match[0]))
  return values
}
