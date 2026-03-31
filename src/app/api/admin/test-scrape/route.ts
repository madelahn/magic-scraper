import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const maxDuration = 30;

async function curlFetch(url: string): Promise<string> {
  const { stdout } = await execFileAsync("curl", [
    "-s",
    "-H", "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "-H", "Accept: application/json, text/plain, */*",
    "-H", "Accept-Language: en-US,en;q=0.9",
    "-H", "Referer: https://www.moxfield.com/",
    "-H", "Origin: https://www.moxfield.com",
    url,
  ]);
  return stdout;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const collectionId = searchParams.get("id") ?? "tQcWaTADxkSO7fgT0s2_Xw";

  const targetUrl = `https://api2.moxfield.com/v1/collections/search/${collectionId}?sortType=cardName&sortDirection=ascending&pageNumber=1&pageSize=10&playStyle=paperDollars&pricingProvider=cardkingdom`;

  try {
    const body = await curlFetch(targetUrl);

    let bodyPreview: unknown;
    try {
      const parsed = JSON.parse(body);
      bodyPreview = {
        topLevelKeys: Object.keys(parsed),
        dataType: Array.isArray(parsed.data) ? "array" : typeof parsed.data,
        dataLength: parsed.data
          ? Array.isArray(parsed.data)
            ? parsed.data.length
            : Object.keys(parsed.data).length
          : null,
        firstItemKeys:
          parsed.data && !Array.isArray(parsed.data)
            ? Object.keys(Object.values(parsed.data)[0] as object)
            : null,
      };
    } catch {
      bodyPreview = { raw: body.slice(0, 500) };
    }

    return NextResponse.json({ ok: true, body: bodyPreview });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
