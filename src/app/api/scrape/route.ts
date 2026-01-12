import { NextResponse } from "next/server";
import { scrapeETB } from "@/scrapeETB";

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const card = typeof body.card === "string" ? body.card.trim() : "";

        if (!card) {
            return NextResponse.json({ error: "card is required" }, { status: 400 });
        }

        const products = await scrapeETB({ card });

        return NextResponse.json({ products });
    } catch (error) {
        console.error("Scrape failed", error);
        return NextResponse.json({ error: "Failed to scrape" }, { status: 500 });
    }
}
