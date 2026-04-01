-- Migration 022: Cross-validation cleanup
-- Deactivates 27 bad offers identified by cross-source comparison.
--
-- Fix 1 (6 rows): Pre-merge originals — cards where migration 020 created a
--   "(merged)" summary row but left the original component rows active.
--   Keep the merged row; deactivate the originals.
--
-- Fix 2 (3 rows): Active p3 offers that migration 020 missed.
--   (Amex Aeroplan Card, Amex Gold Rewards, Amex Aeroplan Reserve)
--
-- Fix 3 (4 rows): Wrong-card associations.
--   - TD Cash Back Visa Infinite with an Aeroplan offer headline
--   - Amex Aeroplan Card (Aeroplan program) with "MR points" offers (wrong program)
--   Note: one ID overlaps with Fix 2 — dedup handled by IN clause.
--
-- Fix 4 (16 rows, some overlap): Legacy offers with $undefined headlines or
--   points_value = 0 and no cashback_value. These pre-date the validation layer
--   and would be rejected if re-scraped today.

UPDATE card_offers
SET is_active = false
WHERE id IN (
  -- Fix 1: pre-merge originals
  '50051979-2dac-41a5-af8a-683246425bb3',
  '86cfd174-efe9-4ee3-b286-64c11e9b42d5',
  'b4577bc2-8a6f-44d5-8ff1-816bc5154a47',
  'd44e7b8d-8b15-46ab-9ede-5482d444f61f',
  '80c868b6-5baa-4d68-805c-6e10b1df5b8b',
  '66427edd-c521-446b-b1a3-85f8f236705d',
  -- Fix 2: leaked p3 offers
  '41255b4b-cee7-43a6-97fb-6dd066569b7b',
  'b16f599b-39c1-4b93-a2bf-bc2694ac8649',
  '62d00cb8-5e76-46d9-94f7-f1a26f614b73',
  -- Fix 3: wrong-card associations
  '8b37c7bd-8dc7-4d50-928a-1878ab9b0000',
  'cfa89c3e-7e9d-4809-b3e7-630c0c44fd66',
  'bf79957d-62ac-4634-b14a-4fdc010bdbb8',
  -- Fix 4: $undefined / zero-value legacy offers
  '7fa877e6-3a97-49e4-9623-ed6cb65c3c89',
  '7b1d0d00-0fe0-4c0e-84a4-3c474f5f05a2',
  'e8206ea5-d124-4dd8-99dc-67d84fb8a157',
  'f263d68f-ca85-4c32-992f-2e7ba8384e8a',
  'c9e38757-4e8e-421c-b687-d8fdd4776b69',
  '51ad2b06-c369-43d7-9076-454a39d301d2',
  '96c450df-44ea-44b2-8cac-85a114520251',
  '8a14a3b0-973d-4fb5-bf42-4e60b93da169',
  '6867cb31-0cca-4e23-b8f8-9e08bcf1f0f6',
  '8b100987-0545-4516-a716-5845ea7fbe5f',
  '73b13a8d-e0f0-4dd3-8a9a-90cab71335af',
  '40b2264b-9e1e-493e-ba78-bca1fc5345c0',
  '158bb777-15e4-4fb1-bd97-ceb7c5622027',
  '60eb8e56-5f75-4c81-982d-37baa4633e0e',
  '5930adac-cb87-4927-b819-fb706ada794b'
);
