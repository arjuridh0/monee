import { useCallback } from 'react'
import { formatRupiah, normalizeCurrencyFormat } from '@/core/finance/currency'
import { useMoneeStore } from '@/store'

export function useRupiah(): (amount: number) => string {
  const format = useMoneeStore(state => normalizeCurrencyFormat(state.profile?.currency?.format))
  return useCallback((amount: number) => formatRupiah(amount, format), [format])
}
