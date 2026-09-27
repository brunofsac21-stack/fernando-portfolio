-- Livro de visitas: tabela, índices e RLS
create table if not exists public.guestbook_messages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 40),
  message     text not null check (char_length(message) between 3 and 500),
  created_at  timestamptz not null default now(),
  reply       text check (reply is null or char_length(reply) between 1 and 1000),
  replied_at  timestamptz,
  is_hidden   boolean not null default false,
  ip_hash     text
);

create index if not exists guestbook_messages_visible_created_idx
  on public.guestbook_messages (created_at desc) where is_hidden = false;
create index if not exists guestbook_messages_ip_created_idx
  on public.guestbook_messages (ip_hash, created_at desc);

alter table public.guestbook_messages enable row level security;

-- Leitura pública só das mensagens visíveis. Escritas: apenas pelo servidor (service role, que ignora RLS).
drop policy if exists "guestbook public read" on public.guestbook_messages;
create policy "guestbook public read" on public.guestbook_messages
  for select to anon, authenticated using (is_hidden = false);

-- O hash do IP nunca é exposto para o público
revoke all on public.guestbook_messages from anon, authenticated;
grant select (id, name, message, created_at, reply, replied_at) on public.guestbook_messages to anon, authenticated;
