import Link from "next/link";

export default function Header() {
    return (
        <header className="flex pt-4 pb-12 justify-between items-baseline">
            <h1 className="text-lg font-bold font-narrow">
                <Link href="/">MTGCardSearch</Link>
            </h1>
            <nav>
                <ul className="flex gap-6 text-sm font-bold">
                    <li><Link href="/checkDeck">Search Friend Collections</Link></li>
                    <li><Link href="/SearchLGS">Search LGS</Link></li>
                </ul>
            </nav>
        </header>
    )
}