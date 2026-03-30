import { NextResponse } from 'next/server';
import { fetch as undiciFetch, ProxyAgent } from 'undici';

export const maxDuration = 30;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const collectionId = searchParams.get('id') ?? 'tQcWaTADxkSO7fgT0s2_Xw';

  const apiKey = process.env.APIFY_API;
  if (!apiKey) {
    return NextResponse.json({ error: 'APIFY_API not set' }, { status: 500 });
  }

  const targetUrl = `https://api2.moxfield.com/v1/collections/search/${collectionId}?sortType=cardName&sortDirection=ascending&pageNumber=1&pageSize=10&playStyle=paperDollars&pricingProvider=cardkingdom`;

  const proxyUrl = `http://auto:${apiKey}@proxy.apify.com:8000`;
  const dispatcher = new ProxyAgent(proxyUrl);

  try {
    const response = await undiciFetch(targetUrl, {
      dispatcher,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.moxfield.com/',
        'Origin': 'https://www.moxfield.com',
      },
    }) as unknown as Response;
    const bodyText = await response.text();

    let bodyPreview: unknown;
    try {
      const parsed = JSON.parse(bodyText);
      bodyPreview = {
        topLevelKeys: Object.keys(parsed),
        dataType: Array.isArray(parsed.data) ? 'array' : typeof parsed.data,
        dataLength: parsed.data
          ? Array.isArray(parsed.data)
            ? parsed.data.length
            : Object.keys(parsed.data).length
          : null,
        firstItemKeys: parsed.data && !Array.isArray(parsed.data)
          ? Object.keys(Object.values(parsed.data)[0] as object)
          : null,
      };
    } catch {
      bodyPreview = { raw: bodyText.slice(0, 500) };
    }

    return NextResponse.json({ status: response.status, ok: response.ok, body: bodyPreview });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
