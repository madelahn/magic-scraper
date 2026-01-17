"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import type { MoxfieldCard } from "@/types/moxfield";

export default function SearchCollection() {
    const [url, setUrl] = useState("");
    const [results, setResults] = useState<MoxfieldCard[]>([]);
    const [error, setError] = useState<string>("");
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;

    const match = trimmed.match(/\/collection\/([a-zA-Z0-9_-]+)/);
    if (!match) {
        setError("Invalid Moxfield collection URL");
        return;
    }

    const collectionId = match[1];
    setIsLoading(true);
    setError("");

    try {
        const response = await fetch("/api/scrapeMoxfield", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ collectionId }),
        });

        if (!response.ok) {
            const message = await response.text();
            throw new Error(message || "Scrape failed");
        }

        const data = (await response.json()) as { cards: MoxfieldCard[] };
        console.log('Received data:', data);
        console.log('Number of cards:', data.cards?.length);
        console.log('First card:', data.cards?.[0]);
        
        setResults(data.cards || []);
    } catch (err) {
        console.error('Error:', err);
        setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
        setIsLoading(false);
    }
};

    return (
        <div>
            <div className="flex items-end justify-between mb-8 pb-2 border-b">
                <h1 className="text-4xl">Moxfield Collection Search</h1>

                <form onSubmit={handleSubmit} className="card-search-form">
                    <div className="relative card-search-input-container">
                        <input
                            type="text"
                            placeholder="Paste Moxfield collection URL"
                            value={url}
                            onChange={(event) => setUrl(event.target.value)}
                            disabled={isLoading}
                            className="card-search-input"
                        />
                        <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 pointer-events-none" />
                    </div>
                </form>
            </div>

            {error && <p className="text-red-500">{error}</p>}
            {isLoading && <p>Loading collection...</p>}

            <ul className="card-search-results">
                {results.map((card, idx) => (
                    <li key={`${card.scryfall_id}-${idx}`} className="card-search-item">
                        <img 
                            src={`https://api.scryfall.com/cards/${card.scryfall_id}?format=image`} 
                            alt={card.name} 
                            width={315} 
                            height={440} 
                        />
                        <div className="flex justify-between mt-2 gap-4 w-[320px]">
                            <div className="flex flex-col min-w-0">
                                <span className="font-bold">{card.name}</span>
                                <span className="text-sm text-gray-500">{card.set_name}</span>
                            </div>
                            <div className="flex-shrink-0 rounded-md bg-accent1 h-min px-2 py-1 text-background">
                                x{card.quantity}
                            </div>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}