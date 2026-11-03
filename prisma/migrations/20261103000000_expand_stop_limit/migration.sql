ALTER TABLE "DeliveryStop"
  DROP CONSTRAINT "DeliveryStop_order_bounds",
  ADD CONSTRAINT "DeliveryStop_order_bounds" CHECK (
    "inputOrder" BETWEEN 0 AND 29 AND
    ("visitOrder" IS NULL OR "visitOrder" BETWEEN 1 AND 30)
  );
