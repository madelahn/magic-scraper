import { NextResponse } from 'next/server';
import { updateAllCollections } from '@/lib/updateCollections';

export async function POST() {
  try {
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
