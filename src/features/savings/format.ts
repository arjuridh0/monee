export const periodLabel = (key: string) => new Date(`${key.slice(0, 7)}-01T00:00:00Z`)
  .toLocaleDateString('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })
