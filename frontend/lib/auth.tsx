'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { getMe, loginUser, registerUser, LoginData, RegisterData } from './api'

interface User {
  id: number
  email: string
  full_name: string
  organization: { id: number; name: string; slug: string; plan: string }
  role: string
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (data: LoginData) => Promise<void>
  register: (data: RegisterData) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('rw-access-token')
    if (token) {
      getMe()
        .then(setUser)
        .catch(() => localStorage.removeItem('rw-access-token'))
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (data: LoginData) => {
    const resp = await loginUser(data)
    localStorage.setItem('rw-access-token', resp.access_token)
    localStorage.setItem('rw-refresh-token', resp.refresh_token)
    const me = await getMe()
    setUser(me)
  }

  const register = async (data: RegisterData) => {
    const resp = await registerUser(data)
    localStorage.setItem('rw-access-token', resp.access_token)
    localStorage.setItem('rw-refresh-token', resp.refresh_token)
    const me = await getMe()
    setUser(me)
  }

  const logout = () => {
    localStorage.removeItem('rw-access-token')
    localStorage.removeItem('rw-refresh-token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
