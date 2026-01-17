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
        const apiUrl = `https://api2.moxfield.com/v1/collections/search/${collectionId}?sortType=cardName&sortDirection=ascending&pageNumber=1&pageSize=5000&playStyle=paperDollars&pricingProvider=cardkingdom`;
        console.log('Navigating to:', apiUrl);
        
        const response = await page.goto(apiUrl, { 
            waitUntil: 'networkidle0',
            timeout: 30000 
        });

        console.log('Response status:', response?.status());

        const bodyText = await page.evaluate(() => document.body.innerText);
        const apiData = JSON.parse(bodyText);

        await browser.close();

        if (!apiData || !apiData.data) {
            throw new Error('No data found in response');
        }

        const cards: MoxfieldCard[] = [];

        // Each key is just a number (0, 1, 2, etc.) and the value is a card object
        for (const key of Object.keys(apiData.data)) {
            const item = apiData.data[key];
            
            // Skip if this doesn't have the card data
            if (!item || !item.card) {
                continue;
            }
            
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

        console.log('Total cards processed:', cards.length);
        return cards;
        
    } catch (error) {
        console.error('Scrape error:', error);
        await browser.close();
        throw error;
    }
}