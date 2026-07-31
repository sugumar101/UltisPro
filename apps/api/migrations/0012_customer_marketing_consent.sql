-- Customer marketing consent, captured at the till.
--
-- Sending offers / new-collection announcements over WhatsApp or SMS is not
-- something a shop may do to anyone whose number happens to be on a bill:
-- India's TRAI/DND framework requires prior consent for promotional
-- messaging, and WhatsApp's own Business Policy bans unsolicited marketing
-- (offending numbers get blocked, which costs the shop the channel
-- entirely). So consent is stored explicitly rather than inferred from the
-- presence of a phone number.
--
-- `marketing_consent_at` records *when* it was given, because "we have
-- consent" is only defensible if you can say when it was obtained. Both
-- columns are nullable/defaulted so every existing customer starts as
-- not-opted-in — the safe default, and the only honest one for numbers
-- collected before this field existed.
ALTER TABLE customers ADD COLUMN marketing_opt_in BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE customers ADD COLUMN marketing_consent_at TIMESTAMPTZ;

-- Transactional messages (sending a customer their own receipt) are a
-- different category and do not depend on this flag — the customer asked for
-- that bill by buying something.

-- Phone is the lookup key at the counter, so make that path indexed. The
-- existing UNIQUE (organization_id, phone) already covers exact matches;
-- this supports the normalised-suffix lookups the app performs.
CREATE INDEX IF NOT EXISTS idx_customers_org_phone ON customers(organization_id, phone) WHERE deleted_at IS NULL;
