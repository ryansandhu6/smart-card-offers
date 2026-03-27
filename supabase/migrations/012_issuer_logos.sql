-- migration 012: populate issuer logo_url
-- Uses Clearbit Logo API (https://logo.clearbit.com/{domain}).
-- The logo_url column already exists (added in schema creation).
-- All 20 issuers previously had logo_url = NULL.

UPDATE issuers SET logo_url = 'https://logo.clearbit.com/americanexpress.com'
  WHERE slug = 'amex';

UPDATE issuers SET logo_url = 'https://logo.clearbit.com/td.com'
  WHERE slug = 'td';

UPDATE issuers SET logo_url = 'https://logo.clearbit.com/scotiabank.com'
  WHERE slug = 'scotiabank';

UPDATE issuers SET logo_url = 'https://logo.clearbit.com/bmo.com'
  WHERE slug = 'bmo';

UPDATE issuers SET logo_url = 'https://logo.clearbit.com/cibc.com'
  WHERE slug = 'cibc';

UPDATE issuers SET logo_url = 'https://logo.clearbit.com/rbc.com'
  WHERE slug = 'rbc';

UPDATE issuers SET logo_url = 'https://logo.clearbit.com/nbc.ca'
  WHERE slug = 'national-bank';

UPDATE issuers SET logo_url = 'https://logo.clearbit.com/hsbc.ca'
  WHERE slug = 'hsbc';

UPDATE issuers SET logo_url = 'https://logo.clearbit.com/tangerine.ca'
  WHERE slug = 'tangerine';

UPDATE issuers SET logo_url = 'https://logo.clearbit.com/pcfinancial.ca'
  WHERE slug = 'pc-financial';

UPDATE issuers SET logo_url = 'https://logo.clearbit.com/desjardins.com'
  WHERE slug = 'desjardins';

UPDATE issuers SET logo_url = 'https://logo.clearbit.com/mbna.ca'
  WHERE slug = 'mbna';

UPDATE issuers SET logo_url = 'https://logo.clearbit.com/rogersbank.com'
  WHERE slug = 'rogers-bank';

UPDATE issuers SET logo_url = 'https://logo.clearbit.com/brimfinancial.com'
  WHERE slug = 'brim';

UPDATE issuers SET logo_url = 'https://logo.clearbit.com/neo.ca'
  WHERE slug = 'neo-financial';

UPDATE issuers SET logo_url = 'https://logo.clearbit.com/canadiantire.ca'
  WHERE slug = 'canadian-tire';

UPDATE issuers SET logo_url = 'https://logo.clearbit.com/hometrust.ca'
  WHERE slug = 'home-trust';

UPDATE issuers SET logo_url = 'https://logo.clearbit.com/laurentianbank.ca'
  WHERE slug = 'laurentian-bank';

UPDATE issuers SET logo_url = 'https://logo.clearbit.com/meridiancu.ca'
  WHERE slug = 'meridian';

UPDATE issuers SET logo_url = 'https://logo.clearbit.com/simplii.com'
  WHERE slug = 'simplii';
