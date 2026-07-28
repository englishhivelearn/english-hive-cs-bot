-- AlterTable
ALTER TABLE "knowledge" ADD COLUMN     "matchCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "unanswered_queries" (
    "id" SERIAL NOT NULL,
    "phone" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unanswered_queries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "unanswered_queries_resolved_idx" ON "unanswered_queries"("resolved");
