-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'OPTIMIZED');

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryPlan" (
    "id" TEXT NOT NULL,
    "deliveryDate" DATE NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "warehouseNameSnapshot" TEXT NOT NULL,
    "warehouseLatitudeSnapshot" DOUBLE PRECISION NOT NULL,
    "warehouseLongitudeSnapshot" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "optimizedAt" TIMESTAMP(3),
    "optimizationToken" TEXT,
    "optimizationStartedAt" TIMESTAMP(3),
    "revision" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DeliveryPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryStop" (
    "id" TEXT NOT NULL,
    "deliveryPlanId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "storeNameSnapshot" TEXT NOT NULL,
    "latitudeSnapshot" DOUBLE PRECISION NOT NULL,
    "longitudeSnapshot" DOUBLE PRECISION NOT NULL,
    "inputOrder" INTEGER NOT NULL,
    "visitOrder" INTEGER,

    CONSTRAINT "DeliveryStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL DEFAULT 'admin',
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Store_isActive_name_id_idx" ON "Store"("isActive", "name", "id");

-- CreateIndex
CREATE INDEX "DeliveryPlan_deliveryDate_id_idx" ON "DeliveryPlan"("deliveryDate", "id");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryStop_deliveryPlanId_storeId_key" ON "DeliveryStop"("deliveryPlanId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryStop_deliveryPlanId_inputOrder_key" ON "DeliveryStop"("deliveryPlanId", "inputOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_username_key" ON "Admin"("username");

-- AddForeignKey
ALTER TABLE "DeliveryStop" ADD CONSTRAINT "DeliveryStop_deliveryPlanId_fkey" FOREIGN KEY ("deliveryPlanId") REFERENCES "DeliveryPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryStop" ADD CONSTRAINT "DeliveryStop_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Business invariants also enforced below API validation.
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_singleton" CHECK ("id" = 'main');
ALTER TABLE "Warehouse" ADD CONSTRAINT "Warehouse_coordinates" CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180);
ALTER TABLE "Store" ADD CONSTRAINT "Store_coordinates" CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180);
ALTER TABLE "DeliveryPlan" ADD CONSTRAINT "DeliveryPlan_coordinates" CHECK ("warehouseLatitudeSnapshot" BETWEEN -90 AND 90 AND "warehouseLongitudeSnapshot" BETWEEN -180 AND 180);
ALTER TABLE "DeliveryStop" ADD CONSTRAINT "DeliveryStop_coordinates" CHECK ("latitudeSnapshot" BETWEEN -90 AND 90 AND "longitudeSnapshot" BETWEEN -180 AND 180);
ALTER TABLE "DeliveryStop" ADD CONSTRAINT "DeliveryStop_order_bounds" CHECK ("inputOrder" BETWEEN 0 AND 24 AND ("visitOrder" IS NULL OR "visitOrder" BETWEEN 1 AND 25));
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Store_name_search_idx" ON "Store" USING GIN ("name" gin_trgm_ops);
