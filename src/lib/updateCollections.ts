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
      
      // Atomic: all three operations commit together or none do
      await prisma.$transaction(async (tx) => {
        const deleteResult = await tx.collectionCard.deleteMany({
          where: { userId: user.id }
        });
        console.log(`Deleted ${deleteResult.count} old cards`);

        const createResult = await tx.collectionCard.createMany({
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

        await tx.user.update({
          where: { id: user.id },
          data: { lastUpdated: new Date() }
        });
      });

      console.log(`Successfully updated ${cards.length} cards for ${user.name}`);
    } catch (error) {
      // Transaction rolled back automatically — user's cards are intact
      const message = `Collection update failed for user "${user.name}" (id: ${user.id}). ` +
        `No changes were made — the user's cards are intact. ` +
        `To fix: re-trigger the collection update for this user. ` +
        `Original error: ${error instanceof Error ? error.message : String(error)}`;
      console.error(message, error);
      throw new Error(message);
    }
  }
  
  // Final check
  const totalCards = await prisma.collectionCard.count();
  console.log(`\n=== Update Complete ===`);
  console.log(`Total cards in database: ${totalCards}`);
}