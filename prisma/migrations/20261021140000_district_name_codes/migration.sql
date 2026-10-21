-- Replace the railway-station district codes with 3-letter codes taken from each
-- district's own name (e.g. Mayiladuthurai MV → MYD), and rename player IDs that
-- were already issued with an old code so every ID uses the new prefix. The
-- series letter and number are kept, so the per-district sequence is unchanged.

CREATE TEMP TABLE "_district_code_change" (name TEXT PRIMARY KEY, old_code TEXT NOT NULL, new_code TEXT NOT NULL);
INSERT INTO "_district_code_change" (name, old_code, new_code) VALUES
    ('Ariyalur', 'ALU', 'ARI'),
    ('Chengalpattu', 'CGL', 'CGP'),
    ('Chennai', 'MAS', 'CHN'),
    ('Coimbatore', 'CBE', 'CBE'),
    ('Cuddalore', 'CUPJ', 'CUD'),
    ('Dharmapuri', 'DPJ', 'DHA'),
    ('Dindigul', 'DG', 'DIN'),
    ('Erode', 'ED', 'ERD'),
    ('Kallakurichi', 'KLKI', 'KLK'),
    ('Kanchipuram', 'CJ', 'KPM'),
    ('Kanniyakumari', 'CAPE', 'KKM'),
    ('Karur', 'KRR', 'KAR'),
    ('Krishnagiri', 'KRGI', 'KGI'),
    ('Madurai', 'MDU', 'MDU'),
    ('Mayiladuthurai', 'MV', 'MYD'),
    ('Nagapattinam', 'NGT', 'NGP'),
    ('Namakkal', 'NMKL', 'NMK'),
    ('Nilgiris', 'UAM', 'NLG'),
    ('Perambalur', 'PMBR', 'PMB'),
    ('Pudukkottai', 'PDKT', 'PDK'),
    ('Ramanathapuram', 'RMD', 'RMD'),
    ('Ranipet', 'RNPT', 'RPT'),
    ('Salem', 'SA', 'SLM'),
    ('Sivaganga', 'SVGA', 'SVG'),
    ('Tenkasi', 'TSI', 'TKS'),
    ('Thanjavur', 'TJ', 'TJV'),
    ('Theni', 'TENI', 'THN'),
    ('Thoothukudi', 'TN', 'TKD'),
    ('Tiruchirappalli', 'TPJ', 'TRC'),
    ('Tirunelveli', 'TEN', 'TNV'),
    ('Tirupathur', 'TPT', 'TPR'),
    ('Tiruppur', 'TUP', 'TUP'),
    ('Tiruvallur', 'TRL', 'TVL'),
    ('Tiruvannamalai', 'TNM', 'TVM'),
    ('Tiruvarur', 'TVR', 'TVR'),
    ('Vellore', 'VLR', 'VLR'),
    ('Viluppuram', 'VM', 'VPM'),
    ('Virudhunagar', 'VPT', 'VNR');

-- Rename issued player IDs (OLD-A-001 → NEW-A-001) for districts still on their seeded code.
UPDATE "Student" AS s
SET "permanentId" = c.new_code || substr(s."permanentId", length(c.old_code) + 1)
FROM "_district_code_change" AS c
JOIN "District" AS d ON d."name" = c.name AND d."code" = c.old_code
WHERE s."districtId" = d."id"
  AND c.old_code <> c.new_code
  AND s."permanentId" ~ ('^' || c.old_code || '-[A-Z]-[0-9]{3}$');

-- Clear first so swapping codes between districts cannot trip the unique index.
-- Only districts still on their seeded railway code are changed; codes an admin
-- has already edited are left alone.
UPDATE "District" AS d SET "code" = NULL
FROM "_district_code_change" AS c
WHERE d."name" = c.name AND d."code" = c.old_code;

UPDATE "District" AS d SET "code" = c.new_code
FROM "_district_code_change" AS c
WHERE d."name" = c.name AND d."code" IS NULL;

DROP TABLE "_district_code_change";
