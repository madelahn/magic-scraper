import { NextResponse } from 'next/server';
import { updateAllCollections } from '@/lib/updateCollections';

export async function POST(request: Request) {
  try {
    const { secret } = await request.json();
    
    // Check admin secret
    if (secret !== process.env.ADMIN_SECRET) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    await updateAllCollections();
    
    return NextResponse.json({ success: true, message: 'Collections updated successfully' });
  } catch (error) {
    console.error('Update error:', error);
    return NextResponse.json(
      { error: 'Failed to update collections' },
      { status: 500 }
    );
  }
}