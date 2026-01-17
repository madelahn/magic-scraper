import "server-only";
import type { MoxfieldCard } from "@/types/moxfield";

export async function scrapeMoxfield({ collectionId }: { collectionId: string }): Promise<MoxfieldCard[]> {
    const url = `https://api2.moxfield.com/v1/collections/search/${collectionId}?sortType=cardName&sortDirection=ascending&pageNumber=1&pageSize=10000&playStyle=paperDollars&pricingProvider=cardkingdom`;

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch collection: ${response.statusText}`);
    }

    const data = await response.json();
    const cards: MoxfieldCard[] = [];

    // Flatten all the [0_99], [100_199] blocks
    for (const block of Object.values(data.data)) {
        if (Array.isArray(block)) {
            for (const item of block) {
                cards.push({
                    name: item.card.name,
                    scryfall_id: item.card.scryfall_id,
                    quantity: item.quantity,
                    condition: item.condition,
                    isFoil: item.isFoil,
                    set: item.card.set,
                    set_name: item.card.set_name,
                });
            }
        }
    }

    return cards;
}