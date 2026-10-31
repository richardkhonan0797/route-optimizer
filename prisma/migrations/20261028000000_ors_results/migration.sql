ALTER TABLE "DeliveryPlan" ADD COLUMN "distanceMeters" DOUBLE PRECISION,
ADD COLUMN "durationSeconds" DOUBLE PRECISION,
ADD COLUMN "routingProvider" TEXT;
UPDATE "DeliveryPlan" SET "routingProvider" = 'GOOGLE_LEGACY' WHERE "status" = 'OPTIMIZED';
ALTER TABLE "DeliveryPlan" ADD CONSTRAINT "DeliveryPlan_metrics_check" CHECK (
("distanceMeters" IS NULL OR ("distanceMeters" >= 0 AND "distanceMeters" < 'Infinity'::float8)) AND
("durationSeconds" IS NULL OR ("durationSeconds" >= 0 AND "durationSeconds" < 'Infinity'::float8)));
