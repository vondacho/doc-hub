-- Executed once, on first boot, against the POSTGRES_DB created by initdb.
--
-- Strapi owns its schema: it runs its own migrations at startup and creates
-- every table it needs. Nothing here may pre-create application tables — this
-- file only sets up what Strapi cannot set up for itself.

-- Strapi stores and compares timestamps in UTC. Pinning the database default
-- stops a differently configured host from shifting createdAt/updatedAt.
ALTER DATABASE strapi SET timezone TO 'UTC';

-- Trigram support. doc-portal's catalogue search is a substring match over a
-- product's name, summary, domain, owner and tags; the day that search moves
-- from the portal's in-memory array to a query against this database, it is a
-- trigram index that keeps it from being a sequential scan.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- POSTGRES_USER already owns the database and therefore holds CREATE on the
-- public schema. Stated explicitly because PostgreSQL 15 revoked that grant
-- from PUBLIC, and this is the first thing to check if Strapi's bootstrap ever
-- fails with "permission denied for schema public".
GRANT ALL ON SCHEMA public TO strapi;
