const puppeteer = require('puppeteer');

const card = "Command Tower";

(async () => {
    const cardUrl = card.toLowerCase().replace(/\s+/g, '-');
    const url = `https://enterthebattlefield.ca/search?q=%22${cardUrl}%22`;
    
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.store-pass-product', { timeout: 1000 });

    // Click the "In Stock Only" filter
    try {
        await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const inStockLink = links.find(a => a.textContent.includes('In Stock Only'));
            if (inStockLink) {
                inStockLink.click();
            } else {
                throw new Error('In Stock Only link not found');
            }
        });
        await page.waitForFunction(() => document.querySelectorAll('.store-pass-product').length > 0, { timeout: 3000 });
    } catch {
        console.log('In Stock filter not found, proceeding without it');
    }

    await page.waitForSelector('.store-pass-product', { timeout: 1000 });

    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 300;
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if (totalHeight >= scrollHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 50);
        });
    });

    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Extract data
    const products = await page.evaluate((cardName) => {
        const productElements = document.querySelectorAll('.store-pass-product');
        const results = [];
        const cardLower = cardName.toLowerCase();

        productElements.forEach((product) => {
            const titleEl = product.querySelector('.store-pass-product-title a');
            const imageEl = product.querySelector('.store-pass-product-image-container img');
            const priceEl = product.querySelector('.store-pass-product-price');
            const title = titleEl ? titleEl.textContent.trim() : '';

            if (!title.toLowerCase().includes(cardLower)) return;

            const inventory = [];
            product.querySelectorAll('.store-pass-product-inventory-quantity').forEach((inv) => {
                inventory.push(inv.textContent.trim());
            });

            let imageUrl = imageEl ? imageEl.getAttribute('src') || imageEl.src || '' : '';
            if (imageUrl) {
                imageUrl = imageUrl.split('?')[0];
            }

            results.push({
                title,
                price: priceEl ? priceEl.textContent.trim() : '',
                inventory,
                image: imageUrl,
                link: titleEl ? titleEl.href : '',
            });
        });

        return results;
    }, card);

    console.log(`Found ${products.length} products`);
    console.log(JSON.stringify(products, null, 2));
    
    await browser.close();
})();