-- migration 011: sanitise card slugs
-- Strips any character outside [a-z0-9-], collapses consecutive dashes,
-- and trims leading/trailing dashes.
-- Root cause: card names containing ®, ™, * were turned into slugs that
-- kept a trailing "-" after the special char was removed.
-- Affected (at time of writing): 2 rows.

UPDATE credit_cards
SET slug = regexp_replace(
             regexp_replace(
               regexp_replace(lower(slug), '[^a-z0-9\-]', '', 'g'),
             '-{2,}', '-', 'g'),
           '^-+|-+$', '', 'g')
WHERE slug ~ '[^a-z0-9\-]|^-|-$|-{2,}';
