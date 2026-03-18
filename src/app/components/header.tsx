"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"

export default function Header() {
  const router = useRouter()

  const handleLogout = async () => {
    const res = await fetch("/api/auth/logout", { method: "POST" })
    const data = await res.json()
    router.push(data.redirect || "/login")
  }

  return (
    <header className="flex pt-4 pb-12 justify-between items-baseline">
      <h1 className="text-lg font-bold font-narrow">
        <Link href="/">MTGCardSearch</Link>
      </h1>
      <nav>
        <ul className="flex gap-6 text-sm font-bold items-baseline">
          <li><Link href="/checkDeck">Search Friend Collections</Link></li>
          <li><Link href="/SearchLGS">Search LGS</Link></li>
          <li>
            <button
              onClick={handleLogout}
              className="text-foreground/60 hover:text-foreground cursor-pointer"
            >
              Log out
            </button>
          </li>
        </ul>
      </nav>
    </header>
  )
}
