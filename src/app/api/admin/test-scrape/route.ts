import { NextResponse } from 'next/server';

export const maxDuration = 30;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const collectionId = searchParams.get('id') ?? 'tQcWaTADxkSO7fgT0s2_Xw';

  const apiKey = process.env.SCRAPINGBEE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'SCRAPINGBEE_API_KEY not set' }, { status: 500 });
  }

  const targetUrl = `https://api2.moxfield.com/v1/collections/search/${collectionId}?sortType=cardName&sortDirection=ascending&pageNumber=1&pageSize=10&playStyle=paperDollars&pricingProvider=cardkingdom`;

  const scrapingBeeUrl = new URL('https://app.scrapingbee.com/api/v1/');
  scrapingBeeUrl.searchParams.set('api_key', apiKey);
  scrapingBeeUrl.searchParams.set('url', targetUrl);
  scrapingBeeUrl.searchParams.set('render_js', 'false');
  scrapingBeeUrl.searchParams.set('premium_proxy', 'true');

  try {
    const response = await fetch(scrapingBeeUrl.toString());
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
