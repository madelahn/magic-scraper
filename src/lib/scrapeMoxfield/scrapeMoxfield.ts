import "server-only";
import puppeteer from 'puppeteer';
import type { MoxfieldCard } from "@/types/moxfield";

export async function scrapeMoxfield({ collectionId }: { collectionId: string }): Promise<MoxfieldCard[]> {
    console.log('Starting scrape for collection:', collectionId);
    
    const browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        let allCards: MoxfieldCard[] = [];
        let pageNumber = 1;
        let hasMorePages = true;
        const pageSize = 5000; // Keep at 5000 per page
        
        while (hasMorePages) {
            const apiUrl = `https://api2.moxfield.com/v1/collections/search/${collectionId}?sortType=cardName&sortDirection=ascending&pageNumber=${pageNumber}&pageSize=${pageSize}&playStyle=paperDollars&pricingProvider=cardkingdom`;
            console.log(`Fetching page ${pageNumber}...`);
            
            const response = await page.goto(apiUrl, { 
                waitUntil: 'networkidle0',
                timeout: 30000 
            });

            const bodyText = await page.evaluate(() => document.body.innerText);
            const apiData = JSON.parse(bodyText);

            if (!apiData || !apiData.data) {
                break;
            }

            const pageCards: MoxfieldCard[] = [];

            for (const key of Object.keys(apiData.data)) {
                const item = apiData.data[key];
                
                if (!item || !item.card) {
                    continue;
                }
                
                const isBasicLand = item.card.type_line?.startsWith('Basic Land');
                const isToken = item.card.type === "6";
                
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
                    type_line: item.card.type_line || '',
                });
            }

            console.log(`  Got ${pageCards.length} cards from page ${pageNumber}`);
            allCards = allCards.concat(pageCards);
            
            // Check if there are more pages
            if (pageCards.length < pageSize || Object.keys(apiData.data).length === 0) {
                hasMorePages = false;
            } else {
                pageNumber++;
            }
        }

        await browser.close();
        console.log('Total cards processed:', allCards.length);
        return allCards;
        
    } catch (error) {
        console.error('Scrape error:', error);
        await browser.close();
        throw error;
    }
}