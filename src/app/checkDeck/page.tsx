"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface Owner {
  name: string;
  quantity: number;
  condition: string;
  isFoil: boolean;
}

interface Printing {
  set: string;
  setName: string;
  scryfallId: string;
  owners: Owner[];
}

interface CardMatch {
  cardName: string;
  printings: Printing[];
}

export default function CheckDeck() {
  const [decklist, setDecklist] = useState("");
  const [results, setResults] = useState<CardMatch[]>([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  const toggleCard = (cardName: string) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(cardName)) {
      newExpanded.delete(cardName);
    } else {
      newExpanded.add(cardName);
    }
    setExpandedCards(newExpanded);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decklist.trim()) return;

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/checkDeck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decklist }),
      });

      if (!response.ok) {
        throw new Error("Failed to check deck");
      }

      const data = await response.json();
      setResults(data.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  const getConditionColor = (condition: string) => {
    switch (condition.toLowerCase()) {
      case "nearmint":
      case "near mint":
        return "text-green-700";
      case "lightlyplayed":
      case "lightly played":
        return "text-blue-700";
      case "moderatelyplayed":
      case "moderately played":
        return "text-yellow-700";
      case "heavilyplayed":
      case "heavily played":
        return "text-orange-700";
      case "damaged":
        return "text-red-700";
      default:
        return "text-gray-700";
    }
  };

  const formatCondition = (condition: string) => {
    return condition
      .replace(/([A-Z])/g, " $1")
      .trim()
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <div className="max-w-7xl mx-auto p-8">
      <h1 className="text-4xl mb-8">Deck Checker</h1>

      <form onSubmit={handleSubmit} className="mb-8">
        <textarea
          value={decklist}
          onChange={(e) => setDecklist(e.target.value)}
          placeholder="Paste your decklist here..."
          className="w-full h-96 p-4 border rounded font-mono text-sm"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading}
          className="mt-4 px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {isLoading ? "Checking..." : "Check Deck"}
        </button>
      </form>

      {error && <p className="text-red-500 mb-4">{error}</p>}

      {results.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-2xl mb-4">
            Found Matches ({results.length} cards)
          </h2>
          {results.map((card) => (
            <div key={card.cardName} className="border rounded">
              <button
                onClick={() => toggleCard(card.cardName)}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50"
              >
                <div className="flex items-center gap-4">
                  <span className="font-semibold text-lg">{card.cardName}</span>
                  <span className="text-sm text-gray-500">
                    {card.printings.length} printing{card.printings.length !== 1 ? "s" : ""}
                  </span>
                </div>
                {expandedCards.has(card.cardName) ? (
                  <ChevronDown className="w-5 h-5" />
                ) : (
                  <ChevronRight className="w-5 h-5" />
                )}
              </button>

              {expandedCards.has(card.cardName) && (
                <div className="p-4 bg-gray-50">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {card.printings.map((printing, idx) => (
                      <div
                        key={idx}
                        className="group relative border rounded bg-white p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                      >
                        {/* Hover image - positioned with fixed to avoid overflow issues */}
                        <div className="hidden group-hover:block fixed z-[9999] pointer-events-none">
                          <img
                            src={`https://api.scryfall.com/cards/${printing.scryfallId}?format=image`}
                            alt={card.cardName}
                            className="w-64 rounded-lg shadow-2xl border-2 border-gray-300"
                            style={{
                              position: 'fixed',
                              right: '20px',
                              bottom: '20px',
                            }}
                          />
                        </div>

                        {/* Set info */}
                        <div className="font-semibold text-sm mb-2 border-b pb-2">
                          {printing.setName}
                          <span className="text-xs text-gray-500 ml-2">
                            ({printing.set.toUpperCase()})
                          </span>
                        </div>

                        {/* Owners */}
                        <div className="space-y-1">
                          {printing.owners.map((owner, ownerIdx) => (
                            <div
                              key={ownerIdx}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="font-medium truncate mr-2">
                                {owner.name}
                              </span>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="bg-gray-100 px-2 py-0.5 rounded text-xs">
                                  x{owner.quantity}
                                </span>
                                <span className={`text-xs ${getConditionColor(owner.condition)}`}>
                                  {formatCondition(owner.condition)}
                                </span>
                                {owner.isFoil && (
                                  <span className="text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded">
                                    ✨
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}