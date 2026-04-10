-- Phase 5 (v1.1): Add Game tracking + SyncLog tables
-- Additive-only migration per D-16
-- Generated from prisma/schema.prisma via `prisma migrate diff --from-empty --to-schema-datamodel`
-- Pre-existing tables (users, collection_cards) and their indexes are excluded.

-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "wonByCombo" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "game_participants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "gameId" TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "isWinner" BOOLEAN NOT NULL,
    "isScrewed" BOOLEAN NOT NULL,
    "deckName" TEXT,
    CONSTRAINT "game_participants_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sync_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "games_date_idx" ON "games"("date");

-- CreateIndex
CREATE INDEX "game_participants_playerName_idx" ON "game_participants"("playerName");

-- CreateIndex
CREATE INDEX "sync_logs_userId_createdAt_idx" ON "sync_logs"("userId", "createdAt");
