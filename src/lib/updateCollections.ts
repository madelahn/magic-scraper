import { prisma } from './prisma';
import { scrapeMoxfield } from './scrapeMoxfield/scrapeMoxfield';

export async function updateAllCollections() {
  const users = await prisma.user.findMany();
  
  console.log(`Starting update for ${users.length} users...`);
  console.log('Users:', users.map(u => ({ name: u.name, id: u.moxfieldCollectionId })));
  
  for (const user of users) {
    console.log(`\n=== Updating collection for ${user.name} ===`);
    console.log('Collection ID:', user.moxfieldCollectionId);
    
    try {
      const cards = await scrapeMoxfield({ 
        collectionId: user.moxfieldCollectionId 
      });
      
      console.log(`Scraped ${cards.length} cards for ${user.name}`);
      
      if (cards.length === 0) {
        console.log('⚠️ No cards scraped - skipping database update');
        continue;
      }
      
      // Show first card as example
      console.log('Example card:', cards[0]);
      
      // Delete old entries for this user
      const deleteResult = await prisma.collectionCard.deleteMany({
        where: { userId: user.id }
      });
      console.log(`Deleted ${deleteResult.count} old cards`);
      
      // Insert new entries
      const createResult = await prisma.collectionCard.createMany({
        data: cards.map(card => ({
          userId: user.id,
          cardName: card.name,
          scryfallId: card.scryfall_id,
          set: card.set,
          setName: card.set_name,
          quantity: card.quantity,
          condition: card.condition,
          isFoil: card.isFoil,
          typeLine: card.type_line,
        }))
      });
      console.log(`Inserted ${createResult.count} new cards`);
      
      // Update user's last updated timestamp
      await prisma.user.update({
        where: { id: user.id },
        data: { lastUpdated: new Date() }
      });
      
      console.log(`✓ Successfully updated ${cards.length} cards for ${user.name}`);
    } catch (error) {
      console.error(`✗ Failed to update ${user.name}:`, error);
      if (error instanceof Error) {
        console.error('Error details:', error.message);
        console.error('Stack:', error.stack);
      }
    }
  }
  
  // Final check
  const totalCards = await prisma.collectionCard.count();
  console.log(`\n=== Update Complete ===`);
  console.log(`Total cards in database: ${totalCards}`);
}