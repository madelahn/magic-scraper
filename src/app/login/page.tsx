"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const message = searchParams.get("message")

  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })

      if (res.ok) {
        const data = await res.json()
        router.push(data.redirect || "/")
      } else if (res.status === 401) {
        setError("Incorrect password. Try again.")
      } else {
        setError("Something went wrong. Please try again.")
      }
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm">
        {message === "admin-required" && (
          <div className="mb-4 rounded-lg border border-accent2 bg-accent2/30 px-4 py-3 max-w-sm w-full">
            <p className="text-sm font-bold text-foreground">
              Admin access required — enter the admin password
            </p>
          </div>
        )}

        <div className="bg-background border border-accent2 rounded-2xl shadow-md px-8 py-10 w-full max-w-sm">
          <h1 className="text-xl font-bold font-narrow text-foreground mb-1">
            MTGCardSearch
          </h1>
          <p className="text-sm text-foreground/70 mb-6">
            Enter group password to continue
          </p>

          <form onSubmit={handleSubmit}>
            <div>
              <label className="text-sm font-bold text-foreground mb-1 block">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-accent2 bg-background px-3 py-2 text-base text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-accent1/50"
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`mt-6 w-full justify-center rounded-xl bg-accent1 px-6 py-3 text-lg font-medium cursor-pointer text-background hover:opacity-90 flex items-center${isLoading ? " opacity-60 cursor-not-allowed" : ""}`}
            >
              {isLoading ? "Signing in..." : "Sign in"}
            </button>

            {error && (
              <p className="mt-3 text-sm font-bold text-red-600">{error}</p>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  )
}
