import Image from "next/image";
import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex min-h-screen w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <h1 className="text-5xl font-bold text-zinc-900 dark:text-white sm:text-6xl">CARD SEARCH</h1>

        <div className="flex w-full gap-6 items-center sm:items-start">
          <button className="mt-10 flex items-center rounded-4xl bg-zinc-900 px-6 py-3 text-lg font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200">
            Moxfield Collection Search
          </button>
            <Link href="/SearchLGS">
            <button className="mt-10 flex items-center rounded-4xl bg-zinc-900 px-6 py-3 text-lg font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-200">
              LGS Search
            </button>
            </Link>
        </div>
      </main>
    </div>
  );
}
