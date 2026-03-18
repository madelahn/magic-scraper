import { prisma } from './prisma';

export async function seedUsers() {
  const users = [
    { name: 'Amirali', moxfieldCollectionId: 'tQcWaTADxkSO7fgT0s2_Xw' },
    { name: 'Roma', moxfieldCollectionId: '0smebmQdiEOSydMmLDdDGg' },
    { name: 'Francisco', moxfieldCollectionId: 'vnKNuQTtgEiLOo0tfwU2Qw' },
    { name: 'Andrew', moxfieldCollectionId: 'CpIQY69-e0WkNjwCe4EfRQ' },
    { name: 'Maddie', moxfieldCollectionId: 'fiDkm4SRbEGNqAK0WR7vTA' },
    { name: 'Tillo', moxfieldCollectionId: '-wL5hJSB4UueJ60HhUsQ0w' },
    { name: 'Bing', moxfieldCollectionId: 'iKvW9LHGs0Sv32LPX25AXw' },
    { name: 'Nathan', moxfieldCollectionId: 'QvV91Nvl_kq3xNiH8YHfWg' },
    { name: 'Thijs', moxfieldCollectionId: '9SZD28teaUK2RrBgGmNtww' },
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