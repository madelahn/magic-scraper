import { prisma } from './prisma';

export async function seedUsers() {
  const users = [
    { name: 'Example User', moxfieldCollectionId: 'MoxfieldID' },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { moxfieldCollectionId: user.moxfieldCollectionId },
      update: {},
      create: user,
    });
  }

  console.log('Users seeded successfully');
}