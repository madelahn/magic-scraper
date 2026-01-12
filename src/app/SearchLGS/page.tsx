"use client";

import { useState } from "react";
import type { Product } from "@/types/product";

export default function SearchLGS() {
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<Product[]>([]);
    const [error, setError] = useState<string>("");
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const trimmed = query.trim();
        if (!trimmed) return;

        setIsLoading(true);
        setError("");

        try {
            const response = await fetch("/api/scrape", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ card: trimmed }),
            });

            if (!response.ok) {
                const message = await response.text();
                throw new Error(message || "Scrape failed");
            }

            const data = (await response.json()) as { products: Product[] };
            setResults(data.products || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            {/* Search */}
            <form onSubmit={handleSubmit}>
                <input
                    type="text"
                    placeholder="Insert card name"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    disabled={isLoading}
                    className="card-search-input"
                />
                <button type="submit" disabled={isLoading} className="card-search-button">
                    {isLoading ? "Searching..." : "Search"}
                </button>
            </form>

            {error && <p>{error}</p>}

            {/* Results */}
            <ul className="card-search-results">
                {results.map((product) => (
                    <li key={product.link} className="card-search-item">
                        <img src={product.image} alt={product.title} />
                        <a href={product.link} rel="noopener noreferrer" target="_blank">
                            {product.store}
                            {product.title} — {product.price}
                        </a>
                    </li>
                ))}
            </ul>
        </div>
    );
}