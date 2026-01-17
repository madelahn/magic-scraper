export interface DeckCard {
  quantity: number;
  name: string;
}

export function parseDeckList(decklistText: string): DeckCard[] {
  const lines = decklistText.trim().split('\n');
  const cards: DeckCard[] = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // Match pattern: number followed by card name
    const match = trimmed.match(/^(\d+)\s+(.+)$/);
    if (match) {
      const name = match[2].trim();
      
      // Skip basic lands (case insensitive)
      const lowerName = name.toLowerCase();
      if (lowerName === 'island' || 
          lowerName === 'mountain' || 
          lowerName === 'forest' || 
          lowerName === 'plains' || 
          lowerName === 'swamp' ||
          lowerName.startsWith('snow-covered ')) {
        continue;
      }
      
      cards.push({
        quantity: parseInt(match[1]),
        name: name
      });
    }
  }
  
  return cards;
}