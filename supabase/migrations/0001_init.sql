-- Empire platform storage.
-- Every record (agents, projects, approvals, content posts, ...) is a JSON document
-- keyed by collection and id. Only the server (service role) reads or writes it.

create table if not exists public.records (
  collection text not null,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);

create index if not exists records_collection_created_idx
  on public.records (collection, created_at desc);

-- Lock the table down: no anon or authenticated access. The service role bypasses RLS.
alter table public.records enable row level security;
