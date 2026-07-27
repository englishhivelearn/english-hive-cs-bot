-- AlterTable
ALTER TABLE "knowledge" ADD COLUMN     "excludeKeywords" JSONB,
ADD COLUMN     "requiredGroups" JSONB;
