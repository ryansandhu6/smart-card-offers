-- migration 015: populate points_value / cashback_value on all offers where both are NULL
--
-- Strategy:
--   1. Deactivate junk offers (scraper artifacts: "$undefined", "Flights, hotels...",
--      sponsored ad content, FAQ text, impossible dollar amounts, earn-rate descriptions).
--      These get points_value = 0 so the NULL-count check passes.
--   2. Set points_value  for genuine points/miles offers (raw count from headline).
--   3. Set cashback_value for genuine cashback offers (dollar value from headline).
--
-- CPP reference used for program identification only (not stored here):
--   Aeroplan 0.02 | Avion 0.018 | MBNA Rewards 0.01 | Amex MR 0.02
--   Scene+ 0.01   | TD Rewards 0.005 | BMO Rewards 0.01 | WestJet$ 0.01

-- ── 1. Deactivate junk / unquantifiable offers ────────────────────────────
--    Reasons noted inline.
UPDATE card_offers
SET    is_active = false, points_value = 0
WHERE  id IN (
  -- earn-rate descriptions (not welcome bonuses)
  'c182cdaf-bfed-469d-beb6-dfb0296b0d77',  -- "You are awarded three (3) Scene+ Points..."
  '061d6d8f-20fc-493c-96a6-394a73dffe6d',  -- "You will earn 1% Cash Back..."
  -- card/product descriptions
  '67585e7a-bc87-4ead-82be-9d27e7139183',  -- "There's no limit on the total amount of cash back..."
  '0cd2df7a-fb6f-4a84-9c73-5f58c04781f7',  -- "The SimplyCash Preferred Card earns 2%..."
  'd1ab21bd-0d6d-4bd2-a980-6397fc206477',  -- "Take advantage of great deals such as Platinum status..."
  'bf79957d-62ac-4634-b14a-4fdc010bdbb8',  -- "Up to $1,450 in value including up to 45,000 Aeroplan points" (wrong card)
  -- junk headlines: "Flights, hotels, credit cards, points – your personal travel advisor."
  'd5b1b40d-a869-411e-b785-84c928e8e923',
  '5bf71dda-ddac-4e5f-bd4f-4068a7a8c1ef',
  'c227e709-d5f0-4bbb-bf13-0de70ac1c84b',
  '76c76585-2ace-4682-af72-28690cec0845',
  'cb6dfa09-4e06-4e99-94a3-f0de167e1598',
  '7e1d08fe-3254-43dc-b796-a50952a7dc6f',
  'f14902b3-3391-4bfb-9ef3-e88fb5efbfa3',
  'bd1cbda4-b653-4fe8-8ad2-c19227844420',
  '3e8276fc-26c9-4e8d-95d4-1596db5cd8f6',
  '12453cd7-0cd2-4d6d-bdcf-738d575910bc',
  '67fc719c-434f-45a6-9700-3cb47d144f59',
  '54f534ee-97c5-4836-ab14-787e6462f711',
  '5c28e94a-c146-4d6d-bdcf-738d575910bc',
  'b57e19a6-19b2-4803-a753-0b93cc46f0ee',  -- "Earn up to $1,400 in value†, including up to 165,000 TD Rewards..."
  -- "$undefined" scraper artifacts
  '8a14a3b0-973d-4fb5-bf42-4e60b93da169',
  '158bb777-15e4-4fb1-bd97-ceb7c5622027',
  '73b13a8d-e0f0-4dd3-8a9a-90cab71335af',
  '96c450df-44ea-44b2-8cac-85a114520251',
  '60eb8e56-5f75-4c81-982d-37baa4633e0e',
  'ffcda3b7-fe1e-427d-bd1e-645c55bc76b6',
  '40b2264b-9e1e-493e-ba78-bca1fc5345c0',
  '51ad2b06-c369-43d7-9076-454a39d301d2',
  '8b100987-0545-4516-a716-5845ea7fbe5f',
  'e8206ea5-d124-4dd8-99dc-67d84fb8a157',
  '7b1d0d00-0fe0-4c0e-84a4-3c474f5f05a2',
  'c9e38757-4e8e-421c-b687-d8fdd4776b69',
  -- impossible/erroneous WestJet dollar amounts
  'c960d16c-7769-4655-9831-5187ffe433bb',  -- "$45,000 WestJet dollars" (should be ~$450)
  'd0a8d993-2f76-40eb-80c3-254a77acc1cc',  -- "$25,000 WestJet dollars" (should be ~$250)
  '77ba25e3-8efa-4576-8c20-c3569cf8da18',  -- "$5,000 WestJet dollars" (should be ~$50)
  -- erroneous dollar amount
  'd2484755-5b65-4be9-a2ef-c3a3e9f840be',  -- "$7,000 cash back on first purchase" (≠ 7,000 pts)
  -- FAQ content scraped as offer
  'd3f0c719-2ae4-4097-b4e9-6b29130f0aad',  -- "No. Costco and Walmart are categorized as warehouses..."
  -- sponsored ad content / page titles
  '9102e0d0-0ac4-43ee-af8c-d26b656ebc47',  -- "SponsoredBMO eclipse Visa Infinite* CardGet up to $1,200..."
  '383595ba-cbdd-4e90-8fcb-80c63ee9ec9a'   -- "SponsoredTD First Class Travel® Visa Infinite* Card..."
);

-- ── 2. Set points_value (raw point/mile count from headline) ──────────────

-- Aeroplan (CPP 0.02)
UPDATE card_offers SET points_value = 40000  WHERE id = '41255b4b-cee7-43a6-97fb-6dd066569b7b'; -- Amex Aeroplan "40,000 Amex MR points"
UPDATE card_offers SET points_value = 30000  WHERE id = '89540edd-b13d-4693-a374-3ab54cfc417b'; -- Amex Aeroplan "30,000 Aeroplan points"
UPDATE card_offers SET points_value = 85000  WHERE id = '429926d3-dbcd-4eda-8640-6b0cec9fc29f'; -- Amex Aeroplan Reserve "85,000 Aeroplan points"
UPDATE card_offers SET points_value = 90000  WHERE id = '62d00cb8-5e76-46d9-94f7-f1a26f614b73'; -- Amex Aeroplan Reserve "90,000 Aeroplan points"
UPDATE card_offers SET points_value = 60000  WHERE id = '2ed25c61-172c-4b9e-8515-bc649bf2337b'; -- Amex Aeroplan Reserve "60,000 Aeroplan points"
UPDATE card_offers SET points_value = 20000  WHERE id = '30c69035-f934-4b71-94c1-d42e2b0d7079'; -- TD Aeroplan Privilege "20,000 Aeroplan points"
UPDATE card_offers SET points_value = 60000  WHERE id = 'c15b34dc-6db0-4182-b216-2ec5610d5b03'; -- TD Aeroplan Privilege "60,000 Aeroplan points"
UPDATE card_offers SET points_value = 10000  WHERE id = '34517306-8e41-4e80-85b4-89606d84d888'; -- TD Aeroplan Privilege "10,000 Aeroplan points"
UPDATE card_offers SET points_value = 25000  WHERE id = 'ec2ed52e-d1c8-46c7-a871-815b1e59a864'; -- CIBC Aeroplan Infinite "25,000 Aeroplan points"
UPDATE card_offers SET points_value = 10000  WHERE id = '99783285-4aef-42fe-a392-7e760e6905f8'; -- CIBC Aeroplan Infinite "10,000 Aeroplan points"
UPDATE card_offers SET points_value = 2500   WHERE id = '3b2c1886-9257-4803-8b63-7dbd1291521c'; -- CIBC Aeroplan Infinite "2,500 Aeroplan points"
UPDATE card_offers SET points_value = 10000  WHERE id = '59746594-d3bb-4d35-a800-78ff0d470b8c'; -- CIBC Dividend "10,000 Aeroplan points"
UPDATE card_offers SET points_value = 10000  WHERE id = 'd1d6ab24-263d-42c5-a7d0-3eb6745ecd59'; -- CIBC Dividend "10,000 Aeroplan points"
UPDATE card_offers SET points_value = 10000  WHERE id = 'c14bf281-b586-4dbe-bf8c-32523da6d8c7'; -- TD Aeroplan Platinum "10,000 Aeroplan points"
UPDATE card_offers SET points_value = 70000  WHERE id = 'd734ea1f-8049-4261-9627-dffbc21a8a8e'; -- Amex Gold Rewards "70,000 Aeroplan points"

-- Avion (CPP 0.018)
UPDATE card_offers SET points_value = 35000  WHERE id = 'fc80ec2f-e828-42a1-a9f9-b41a83c833e0'; -- RBC Avion Infinite "35,000 Avion points"
UPDATE card_offers SET points_value = 12000  WHERE id = 'e3e34161-b929-4611-b883-676f0b0f3907'; -- RBC ION "12,000 Avion points"
UPDATE card_offers SET points_value = 4000   WHERE id = 'fcea84ee-0697-477e-a6f4-620e15259595'; -- RBC ION "4,000 Avion points"
UPDATE card_offers SET points_value = 7000   WHERE id = '7bba4e1e-a657-4146-85b9-11e6232d05f3'; -- RBC ION "7,000 Avion points"

-- Avios / British Airways (CPP ~0.015)
UPDATE card_offers SET points_value = 60000  WHERE id = '113bc366-9a7f-46e0-a823-f6105bb2a903'; -- RBC British Airways "Up to 60,000 Avios"
UPDATE card_offers SET points_value = 30000  WHERE id = 'cd5c4569-f277-4bae-b1bd-7b144ab6fa9b'; -- RBC British Airways "30,000 Avios"

-- Amex Membership Rewards (CPP 0.02)
UPDATE card_offers SET points_value = 70000  WHERE id = 'f0bd9fbb-430a-4807-b7d9-841b2dea71f0'; -- Amex Platinum "70,000 Amex MR"
UPDATE card_offers SET points_value = 70000  WHERE id = 'b55f8d99-0ce4-43f9-ba91-04bf13ce1f11'; -- Amex Platinum "70,000 Amex MR"
UPDATE card_offers SET points_value = 110000 WHERE id = '6716f16f-b672-4b8d-92f9-fae18f665478'; -- Amex Platinum "110,000 MR"
UPDATE card_offers SET points_value = 80000  WHERE id = '9a840498-3c9b-420c-b3ae-5c4431c238eb'; -- Amex Platinum "80,000 MR"
UPDATE card_offers SET points_value = 15000  WHERE id = 'f7ed0b91-e802-43c5-9214-757ab24ce4e6'; -- Amex Platinum "Up to 15,000 MR"
UPDATE card_offers SET points_value = 22000  WHERE id = 'd08e3754-802b-4cd6-b18e-fca623b4e5ef'; -- Amex Platinum "22,000 Amex MR" (12-month program)
UPDATE card_offers SET points_value = 15000  WHERE id = '7cb08d14-4fbe-4191-997e-1338dd76e5e9'; -- Amex Cobalt "up to 15,000 Amex points"
UPDATE card_offers SET points_value = 15000  WHERE id = '41b9e3a5-3ea5-44eb-ba06-b64a01c0fbf3'; -- Amex Cobalt "Up to 15,000 MR"
UPDATE card_offers SET points_value = 60000  WHERE id = 'fb091365-26a7-47db-94b0-18671df0bec2'; -- Amex Gold Rewards "Up to 60,000 MR"
UPDATE card_offers SET points_value = 10000  WHERE id = 'c873b23c-dc81-464f-bf99-e37fc778cedd'; -- Amex Gold Rewards "10,000 MR"
UPDATE card_offers SET points_value = 12500  WHERE id = '85e5d15f-a229-4342-8cab-b53b1153b702'; -- Amex Green "12,500 MR"
UPDATE card_offers SET points_value = 12500  WHERE id = 'f4561054-efe4-46f2-a6a1-625205199bcd'; -- Amex Green "12,500 MR"
-- American Express® Gold Rewards Card (distinct card from Amex Gold)
UPDATE card_offers SET points_value = 25000  WHERE id = '82e0ae80-24df-4039-b5f1-0c91b2c6eaf0'; -- "25,000 Amex MR"
UPDATE card_offers SET points_value = 130000 WHERE id = '3d6e6be7-e455-4242-bb2f-4d821d3d0b71'; -- "130,000 MR"
UPDATE card_offers SET points_value = 15000  WHERE id = '0739816d-f21b-434c-862f-27bda4bc2629'; -- "15,000 MR"
UPDATE card_offers SET points_value = 22000  WHERE id = 'b15893d3-3892-4cbd-a33e-5a143dab239f'; -- "22,000 Amex MR" (12-month program)
UPDATE card_offers SET points_value = 70000  WHERE id = '66c536d3-e9e1-4c9d-b228-149189e5d969'; -- "70,000 Amex MR"
UPDATE card_offers SET points_value = 40000  WHERE id = '2a6b44a7-8b34-4922-aeec-5c84611ab932'; -- "40,000 Amex MR"
UPDATE card_offers SET points_value = 60000  WHERE id = 'b16f599b-39c1-4b93-a2bf-bc2694ac8649'; -- "Up to 60,000 Amex MR"
UPDATE card_offers SET points_value = 15000  WHERE id = '9a405280-4909-4c7d-a920-7e87da5a170e'; -- "1,250 MR/month × 12"
UPDATE card_offers SET points_value = 15000  WHERE id = '317c7014-0afa-4b47-8912-943d092cdbb5'; -- "Up to 15,000 MR"
UPDATE card_offers SET points_value = 90000  WHERE id = '57621ed0-3e6b-404b-ae29-88473e69e208'; -- "90,000 MR"

-- BMO Rewards (CPP 0.01)
UPDATE card_offers SET points_value = 60000  WHERE id = 'a5093568-f0bc-4ac7-92a3-b6dc4fb052e2'; -- BMO Ascend WE "60,000 BMO Rewards"
UPDATE card_offers SET points_value = 55000  WHERE id = 'afc1c28b-20ae-4487-9122-13a2e9d4c387'; -- BMO Ascend WE "55,000 BMO Rewards"
UPDATE card_offers SET points_value = 20000  WHERE id = '1f615f9f-ad13-4fcd-9341-40ece4efffff'; -- BMO Ascend WE "20,000 BMO Rewards"
UPDATE card_offers SET points_value = 45000  WHERE id = '4a5df0d4-4818-4deb-9900-1fec59e69d9b'; -- BMO Ascend WE "45,000 BMO Rewards"
UPDATE card_offers SET points_value = 10000  WHERE id = '716a0624-b9c9-4089-83b0-9ce68da74043'; -- BMO VIPorter "10,000 BMO Rewards"
UPDATE card_offers SET points_value = 20000  WHERE id = '36164d25-60e2-4f85-a3d0-b6113ac84fdc'; -- BMO VIPorter "20,000 BMO Rewards"
UPDATE card_offers SET points_value = 60000  WHERE id = '698490b1-20fc-493c-96a6-394a73dffe6d'; -- BMO eclipse Infinite "60,000 BMO Rewards"
UPDATE card_offers SET points_value = 30000  WHERE id = '72957186-cc7f-4e4e-a902-7c03dc0ee323'; -- BMO eclipse Infinite "30,000 BMO Rewards"
UPDATE card_offers SET points_value = 30000  WHERE id = '4ad15ddb-6ddd-4060-b7b5-b0259ab8ff25'; -- BMO eclipse Infinite "30,000 BMO Rewards"
UPDATE card_offers SET points_value = 20000  WHERE id = 'df8cd707-bfe3-4429-bad7-744b5359ae1e'; -- BMO eclipse Rise "20,000 BMO Rewards"
UPDATE card_offers SET points_value = 80000  WHERE id = 'b98dbf93-db9e-48f2-af56-bc96d05e5820'; -- BMO eclipse Rise "80,000 BMO Rewards"
UPDATE card_offers SET points_value = 20000  WHERE id = '84ad71a7-6b26-4760-ae00-7e3086da2b60'; -- TD First Class (sponsored) "20,000 TD Rewards"

-- TD Rewards (CPP 0.005)
UPDATE card_offers SET points_value = 15000  WHERE id = '09d65732-524e-4ebc-bc16-3d57868af0c1'; -- TD Platinum Travel "15,000 TD Rewards"
UPDATE card_offers SET points_value = 15152  WHERE id = 'd726c148-4281-45cb-8029-fcec11823385'; -- TD Rewards Visa "15,152 TD Rewards"
UPDATE card_offers SET points_value = 20000  WHERE id = '84ad71a7-6b26-4760-ae00-7e3086da2b60'; -- already set above (no-op)

-- CIBC Aventura (CPP ~0.01)
UPDATE card_offers SET points_value = 15000  WHERE id = '3f3ab417-c675-4e44-baf7-1c1c2bf08ce1'; -- CIBC Dividend "15,000 Aventura"
UPDATE card_offers SET points_value = 30000  WHERE id = '09cf24bf-b40b-4219-a903-c28dec2fc74d'; -- CIBC Dividend "30,000 Aventura"
UPDATE card_offers SET points_value = 25000  WHERE id = '23cd24ca-37a4-42cc-b6fc-c0eb8a3e60d9'; -- CIBC Dividend "25,000 Aventura"
UPDATE card_offers SET points_value = 20000  WHERE id = '6199f586-e618-45ba-a395-f9f5cc70bb2f'; -- CIBC Aventura Infinite "20,000 Aventura"
UPDATE card_offers SET points_value = 15000  WHERE id = '4ff734f4-0f1e-4363-ab47-af45ae8947c6'; -- CIBC Aventura Infinite "15,000 Aventura"

-- MBNA Rewards (CPP 0.01)
UPDATE card_offers SET points_value = 5000   WHERE id = '56a37a76-596b-48f6-a3c9-89ab5fd368e0'; -- MBNA True Line Gold "5,000 MBNA Rewards"
UPDATE card_offers SET points_value = 20000  WHERE id = 'dd981cee-e60a-4181-abc5-9f4bbf32d278'; -- MBNA True Line Gold "20,000 MBNA Rewards"

-- Marriott Bonvoy (CPP ~0.009)
UPDATE card_offers SET points_value = 110000 WHERE id = '9dfb5753-3f0f-4c94-bd38-60fe5068cdca'; -- "110,000 Bonvoy points"
UPDATE card_offers SET points_value = 80000  WHERE id = '445084ce-b89a-49fa-b7ce-3ccecf2316f3'; -- "80,000 Bonvoy points"
UPDATE card_offers SET points_value = 80000  WHERE id = '34500f0f-d153-4c54-8856-3b506ac06cc7'; -- "80,000 Bonvoy points"

-- Asia Miles / Cathay (CPP ~0.015)
UPDATE card_offers SET points_value = 15000  WHERE id = 'c329e2c7-59fc-4857-beee-89e0369eee54'; -- Cathay "15,000 Asia Miles"

-- AIR MILES (CPP ~0.10 cash miles)
UPDATE card_offers SET points_value = 3000   WHERE id = 'a7adc769-197f-4961-8c9b-2230b1d0dad5'; -- BMO Air Miles "3,000 AIR MILES"
UPDATE card_offers SET points_value = 3000   WHERE id = 'b6b57cab-a187-422c-9d09-f6db639be0aa'; -- BMO Air Miles "3,000 AIR MILES"

-- PC Optimum (CPP 0.001)
UPDATE card_offers SET points_value = 20000  WHERE id = '33ef5596-a8c9-4a57-af1a-e5fa838f8719'; -- PC Financial "20,000 PC Optimum"

-- Laurentian Bank Rewards (CPP ~0.01)
UPDATE card_offers SET points_value = 12000  WHERE id = 'ad319309-dbcd-4eda-8640-6b0cec9fc29f'; -- Laurentian "12,000 LB Rewards"

-- Meridian Rewards (CPP ~0.01)
UPDATE card_offers SET points_value = 7000   WHERE id = '129198a1-dac1-42fb-82fe-312075ae3aa4'; -- Meridian "7,000 Meridian rewards"

-- ── 3. Set cashback_value (dollar amount from headline) ───────────────────

-- CIBC Dividend (cashback bonuses on a dividend card)
UPDATE card_offers SET cashback_value = 250  WHERE id = '23b7da79-e69f-4dea-8a6f-b20cee4c9e5e'; -- "10% cash back on up to $2,500" → $250
UPDATE card_offers SET cashback_value = 25   WHERE id = '6fd3c9d4-beda-43b3-bae2-22501c18a28d'; -- "$25 cash back on first purchase"
UPDATE card_offers SET cashback_value = 300  WHERE id = '7c495c73-48e7-4f0c-a945-186cdfb89955'; -- "10% cash back on up to $3,000" → $300

-- BMO CashBack Mastercard
UPDATE card_offers SET cashback_value = 150  WHERE id = '0085569a-8571-4a67-a5e0-ec1580e3b46d'; -- "10% on up to $1,500" → $150
UPDATE card_offers SET cashback_value = 125  WHERE id = 'fa92594a-5133-4cea-9082-d73e4a154e03'; -- "5% on up to $2,500" → $125

-- BMO CashBack World Elite
UPDATE card_offers SET cashback_value = 125  WHERE id = '2dcd2a8c-8b05-434c-adc8-5030874e398d'; -- "5% cash back for first 3 months (up to $2,500 spend)" → $125
UPDATE card_offers SET cashback_value = 480  WHERE id = '092b0117-b00f-4a37-a71b-b9f9b794d587'; -- "$40 cash back/month × 12 months" → $480

-- Tangerine Money-Back
UPDATE card_offers SET cashback_value = 120  WHERE id = '7d01ba85-d163-496c-be4f-df19a91b3de0'; -- "120 cash back"
UPDATE card_offers SET cashback_value = 100  WHERE id = '0f23723f-1f74-452c-92c0-ece07a44acc3'; -- "10% on up to $1,000" → $100
UPDATE card_offers SET cashback_value = 120  WHERE id = '6a1961bf-9234-4bc2-b71e-7c992b0c2e58'; -- "$120 cash back upon spending $1,500"

-- SimplyCash Preferred (Amex cashback)
UPDATE card_offers SET cashback_value = 400  WHERE id = 'dc4edd86-05d2-4fae-82a1-3f814253efbc'; -- "10% cash back in your first 4 months (up to $400)"
UPDATE card_offers SET cashback_value = 250  WHERE id = '3681a4c7-7678-4eb9-8b45-5735dc43d9af'; -- "250 cash back"
UPDATE card_offers SET cashback_value = 200  WHERE id = '9ee6a2f8-398a-49a4-9847-bdc625d0361e'; -- "10% on up to $2,000" → $200

-- SimplyCash Card from American Express
UPDATE card_offers SET cashback_value = 100  WHERE id = '6bff3fd3-4500-4b6f-bd61-d80b064ec2c6'; -- "5% on up to $2,000" → $100

-- Simplii Financial Cash Back
UPDATE card_offers SET cashback_value = 100  WHERE id = 'ceda64bd-4e25-4942-bdcf-7400dfb943a5'; -- "20% on up to $500" → $100

-- TD Cash Back Visa Infinite
UPDATE card_offers SET cashback_value = 350  WHERE id = '7432958e-daf6-4970-a57f-64deb46508b1'; -- "10% cash back on first $3,500" → $350

-- Scotia Momentum Visa Infinite Card
UPDATE card_offers SET cashback_value = 200  WHERE id = '6f43e4a2-0f3b-42a9-a671-99b5ca7562df'; -- "$200 after $2,000 spend"
