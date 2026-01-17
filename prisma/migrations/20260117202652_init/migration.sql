-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "moxfieldCollectionId" TEXT NOT NULL,
    "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "collection_cards" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "cardName" TEXT NOT NULL,
    "scryfallId" TEXT NOT NULL,
    "set" TEXT NOT NULL,
    "setName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "condition" TEXT NOT NULL,
    "isFoil" BOOLEAN NOT NULL,
    "typeLine" TEXT NOT NULL,
    "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "collection_cards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_moxfieldCollectionId_key" ON "users"("moxfieldCollectionId");

-- CreateIndex
CREATE INDEX "collection_cards_cardName_idx" ON "collection_cards"("cardName");

-- CreateIndex
CREATE INDEX "collection_cards_userId_idx" ON "collection_cards"("userId");
