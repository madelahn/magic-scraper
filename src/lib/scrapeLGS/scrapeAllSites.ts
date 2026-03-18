import { closeBrowser } from '@/lib/scrapeLGS/browser';
import { scrapeETB } from './scrapeETB';
import { scrape401 } from './scrape401';
import { scrapeDCC } from './scrapeDCC';
import { scrapeFTF } from './scrapeFTF';

export async function scrapeAllSites(card: string) {
  const results = await Promise.all([
    scrapeETB({ card }),
    // scrape401({ card }),
    scrapeDCC({ card }),
    scrapeFTF({ card }),

  ]);
  
  await closeBrowser();  // Close browser after all scraping is done
  return results.flat();
}