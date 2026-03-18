import "server-only";
import type { MoxfieldCard } from "@/types/moxfield";

async function fetchMoxfield(targetUrl: string): Promise<Response> {
  const apiKey = process.env.SCRAPINGBEE_API_KEY;
  if (!apiKey) {
    throw new Error("SCRAPINGBEE_API_KEY is not set");
  }

  const scrapingBeeUrl = new URL("https://app.scrapingbee.com/api/v1/");
  scrapingBeeUrl.searchParams.set("api_key", apiKey);
  scrapingBeeUrl.searchParams.set("url", targetUrl);
  scrapingBeeUrl.searchParams.set("render_js", "false");
  scrapingBeeUrl.searchParams.set("premium_proxy", "true");

  return fetch(scrapingBeeUrl.toString());
}

export async function scrapeMoxfield({
  collectionId,
}: {
  collectionId: string;
}): Promise<MoxfieldCard[]> {
  console.log("Starting scrape for collection:", collectionId);

  let allCards: MoxfieldCard[] = [];
  let pageNumber = 1;
  let hasMorePages = true;
  const pageSize = 5000;

  while (hasMorePages) {
    const apiUrl = `https://api2.moxfield.com/v1/collections/search/${collectionId}?sortType=cardName&sortDirection=ascending&pageNumber=${pageNumber}&pageSize=${pageSize}&playStyle=paperDollars&pricingProvider=cardkingdom`;
    console.log(`Fetching page ${pageNumber}...`);

    const response = await fetchMoxfield(apiUrl);

    if (!response.ok) {
      console.error(`Moxfield API returned ${response.status}`);
      break;
    }

    const apiData = await response.json();

    if (!apiData || !apiData.data) {
      break;
    }

    const pageCards: MoxfieldCard[] = [];

    for (const key of Object.keys(apiData.data)) {
      const item = apiData.data[key];

      if (!item || !item.card) {
        continue;
      }

      const isBasicLand = item.card.type_line?.startsWith("Basic Land");
      const isToken = item.card.type_line?.includes("Token");

      if (isBasicLand || isToken) {
        continue;
      }

      pageCards.push({
        name: item.card.name,
        scryfall_id: item.card.scryfall_id,
        quantity: item.quantity,
        condition: item.condition,
        isFoil: item.isFoil,
        set: item.card.set,
        set_name: item.card.set_name,
        type_line: item.card.type_line || "",
      });
    }

    console.log(`  Got ${pageCards.length} cards from page ${pageNumber}`);
    allCards = allCards.concat(pageCards);

    if (pageCards.length < pageSize || Object.keys(apiData.data).length === 0) {
      hasMorePages = false;
    } else {
      pageNumber++;
    }
  }

  console.log("Total cards processed:", allCards.length);
  return allCards;
}
