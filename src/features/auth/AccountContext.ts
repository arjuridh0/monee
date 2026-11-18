import { createContext, useContext } from 'react'

export const AccountContext = createContext({ pinAuth: false })
export const useAccount = () => useContext(AccountContext)
