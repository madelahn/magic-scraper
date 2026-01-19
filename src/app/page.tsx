import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center font-sans">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 sm:items-start">
        <h1 className="text-5xl font-bold sm:text-6xl">CARD SEARCH</h1>

        <div className="flex w-full gap-6 items-center sm:items-start">
          <button className="button">
            <Link href="/checkDeck">Moxfield Friend Collection Search</Link>
          </button>
            <Link href="/SearchLGS">
            <button className="button">
              LGS Search
            </button>
            </Link>
        </div>
      </main>
    </div>
  );
}
