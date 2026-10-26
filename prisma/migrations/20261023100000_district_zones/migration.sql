-- Assign every district to its TNJA zone (A–G). zoneName is what zonal
-- tournaments/events store as zoneId and what zone officials are scoped by.

CREATE TEMP TABLE "_district_zone" (name TEXT PRIMARY KEY, zone TEXT NOT NULL);
INSERT INTO "_district_zone" (name, zone) VALUES
    -- Zone A - Pallavan
    ('Chennai', 'Zone A - Pallavan'),
    ('Chengalpattu', 'Zone A - Pallavan'),
    ('Tiruvallur', 'Zone A - Pallavan'),
    ('Kanchipuram', 'Zone A - Pallavan'),
    ('Viluppuram', 'Zone A - Pallavan'),
    ('Ranipet', 'Zone A - Pallavan'),
    -- Zone B - Velpari
    ('Dharmapuri', 'Zone B - Velpari'),
    ('Krishnagiri', 'Zone B - Velpari'),
    ('Tirupathur', 'Zone B - Velpari'),
    ('Vellore', 'Zone B - Velpari'),
    ('Kallakurichi', 'Zone B - Velpari'),
    ('Tiruvannamalai', 'Zone B - Velpari'),
    -- Zone C - Athiyaman
    ('Coimbatore', 'Zone C - Athiyaman'),
    ('Erode', 'Zone C - Athiyaman'),
    ('Salem', 'Zone C - Athiyaman'),
    ('Tiruppur', 'Zone C - Athiyaman'),
    ('Nilgiris', 'Zone C - Athiyaman'),
    ('Dindigul', 'Zone C - Athiyaman'),
    -- Zone D - Pulikodi
    ('Karur', 'Zone D - Pulikodi'),
    ('Perambalur', 'Zone D - Pulikodi'),
    ('Tiruchirappalli', 'Zone D - Pulikodi'),
    ('Pudukkottai', 'Zone D - Pulikodi'),
    ('Namakkal', 'Zone D - Pulikodi'),
    -- Zone E - Cholan
    ('Ariyalur', 'Zone E - Cholan'),
    ('Nagapattinam', 'Zone E - Cholan'),
    ('Tiruvarur', 'Zone E - Cholan'),
    ('Cuddalore', 'Zone E - Cholan'),
    ('Mayiladuthurai', 'Zone E - Cholan'),
    ('Thanjavur', 'Zone E - Cholan'),
    -- Zone F - Pandian
    ('Ramanathapuram', 'Zone F - Pandian'),
    ('Theni', 'Zone F - Pandian'),
    ('Madurai', 'Zone F - Pandian'),
    ('Sivaganga', 'Zone F - Pandian'),
    ('Virudhunagar', 'Zone F - Pandian'),
    -- Zone G - Velavar
    ('Kanniyakumari', 'Zone G - Velavar'),
    ('Tirunelveli', 'Zone G - Velavar'),
    ('Thoothukudi', 'Zone G - Velavar'),
    ('Tenkasi', 'Zone G - Velavar');

UPDATE "District" d
SET "zoneName" = z.zone
FROM "_district_zone" z
WHERE d.name = z.name;

DROP TABLE "_district_zone";
