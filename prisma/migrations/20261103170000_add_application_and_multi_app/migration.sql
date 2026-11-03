-- CreateTable Application
CREATE TABLE IF NOT EXISTS "Application" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "dialogAppId" TEXT,
    "dialogPassword" TEXT,
    "dialogAppHash" TEXT DEFAULT 'abcdefgh',
    "mobitelAppId" TEXT,
    "mobitelPassword" TEXT,
    "mobitelAppHash" TEXT DEFAULT 'abcdefgh',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Application_code_key" ON "Application"("code");

-- AlterTable User: add columns appCode, appId
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "appCode" TEXT NOT NULL DEFAULT 'examKade';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "appId" TEXT;

-- Drop previous unique index on mobile if it exists
DROP INDEX IF EXISTS "User_mobile_key";

-- Create unique index on mobile and appCode
CREATE UNIQUE INDEX IF NOT EXISTS "User_mobile_appCode_key" ON "User"("mobile", "appCode");
CREATE INDEX IF NOT EXISTS "User_appCode_idx" ON "User"("appCode");
CREATE INDEX IF NOT EXISTS "User_appId_idx" ON "User"("appId");

-- AlterTable OtpSession: add columns appCode, appId
ALTER TABLE "OtpSession" ADD COLUMN IF NOT EXISTS "appCode" TEXT NOT NULL DEFAULT 'examKade';
ALTER TABLE "OtpSession" ADD COLUMN IF NOT EXISTS "appId" TEXT;
CREATE INDEX IF NOT EXISTS "OtpSession_appCode_idx" ON "OtpSession"("appCode");

-- AddForeignKey
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_appId_fkey";
ALTER TABLE "User" ADD CONSTRAINT "User_appId_fkey" FOREIGN KEY ("appId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OtpSession" DROP CONSTRAINT IF EXISTS "OtpSession_appId_fkey";
ALTER TABLE "OtpSession" ADD CONSTRAINT "OtpSession_appId_fkey" FOREIGN KEY ("appId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

