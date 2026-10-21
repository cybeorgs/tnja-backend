-- Read-only: lists records created by the seed scripts (prisma/seed*.ts) so they can
-- be reviewed before cleanup. Run with psql; it changes nothing.
--   docker exec -i tnja_postgres sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB"' < prisma/find_seed_data.sql

\echo '--- Players'
SELECT "tempId", "permanentId", "fullName", email FROM "Student"
WHERE email ILIKE '%@demo.tnja.in' OR email ILIKE '%@dummytest.com' OR email ILIKE '%@test.com'
   OR "tempId" LIKE 'STU_SM_%' OR "tempId" LIKE 'STUD-TEMP%'
ORDER BY email;

\echo '--- Coaches / Referees'
SELECT "tempId", "permanentId", "fullName", email FROM "CoachReferee"
WHERE email ILIKE '%@demo.tnja.in' OR email ILIKE '%@dummytest.com' OR email ILIKE '%@test.com'
   OR "tempId" LIKE 'COACH-TEMP%' OR "tempId" LIKE 'COACH\_%'
ORDER BY email;

\echo '--- Members / office bearers'
SELECT "tempId", "permanentId", "fullName", email, role FROM "Member"
WHERE email ILIKE '%@demo.tnja.in' OR email ILIKE '%@dummytest.com' OR email ILIKE '%@test.com'
   OR email = 'admin@tnja.in' OR "tempId" LIKE 'MEM-TEMP%' OR "tempId" = 'ADMIN-TEMP01'
ORDER BY email;

\echo '--- Clubs'
SELECT "tempId", "permanentId", name, email FROM "Club"
WHERE email ILIKE '%@demo.tnja.in' OR email ILIKE '%@dummytest.com' OR email ILIKE '%@test.com'
   OR email = 'info@chennaijudo.org' OR "tempId" = 'CLUB-TEMP01'
ORDER BY email;

\echo '--- Tournaments'
SELECT id, title, "createdAt"::date FROM "Tournament"
WHERE title ILIKE 'Dummy Tournament%'
ORDER BY title;

\echo '--- Totals'
SELECT
  (SELECT count(*) FROM "Student" WHERE email ILIKE '%@demo.tnja.in' OR email ILIKE '%@dummytest.com' OR email ILIKE '%@test.com' OR "tempId" LIKE 'STU_SM_%' OR "tempId" LIKE 'STUD-TEMP%') AS players,
  (SELECT count(*) FROM "CoachReferee" WHERE email ILIKE '%@demo.tnja.in' OR email ILIKE '%@dummytest.com' OR email ILIKE '%@test.com' OR "tempId" LIKE 'COACH-TEMP%' OR "tempId" LIKE 'COACH\_%') AS coaches,
  (SELECT count(*) FROM "Member" WHERE email ILIKE '%@demo.tnja.in' OR email ILIKE '%@dummytest.com' OR email ILIKE '%@test.com' OR email = 'admin@tnja.in' OR "tempId" LIKE 'MEM-TEMP%' OR "tempId" = 'ADMIN-TEMP01') AS members,
  (SELECT count(*) FROM "Club" WHERE email ILIKE '%@demo.tnja.in' OR email ILIKE '%@dummytest.com' OR email ILIKE '%@test.com' OR email = 'info@chennaijudo.org' OR "tempId" = 'CLUB-TEMP01') AS clubs,
  (SELECT count(*) FROM "Tournament" WHERE title ILIKE 'Dummy Tournament%') AS tournaments;
