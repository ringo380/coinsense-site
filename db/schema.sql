-- Apply once: psql "$DATABASE_URL" -f db/schema.sql
--
-- Stores per-email webhook events from Resend. Resend's own dashboard tracks
-- per-broadcast aggregates; this table is our queryable log for custom
-- analytics (e.g. "who clicked which link across all broadcasts").

create table if not exists email_events (
  id             bigserial   primary key,
  email_id       text        not null,
  event_type     text        not null,  -- sent | delivered | opened | clicked | bounced | complained | delivery_delayed | failed
  email          text,                  -- recipient address (from webhook payload)
  broadcast_id   text,                  -- populated when event originates from a broadcast send
  click_url      text,                  -- set for clicked events
  ts             timestamptz not null default now(),
  raw            jsonb       not null   -- full webhook payload, future-proofing
);

create index if not exists email_events_email_id_idx     on email_events (email_id);
create index if not exists email_events_broadcast_id_idx on email_events (broadcast_id);
create index if not exists email_events_type_ts_idx      on email_events (event_type, ts desc);
