import { NextResponse } from 'next/server';
import { scrapeMoxfield } from '@/lib/scrapeMoxfield';

export async function POST(request: Request) {
    try {
        const { collectionId } = await request.json();
        
        if (!collectionId || typeof collectionId !== 'string') {
            return NextResponse.json(
                { error: 'Collection ID is required' },
                { status: 400 }
            );
        }

        const cards = await scrapeMoxfield({ collectionId });
        
        return NextResponse.json({ cards });
    } catch (error) {
        console.error('Scrape error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to scrape collection' },
            { status: 500 }
        );
    }
}