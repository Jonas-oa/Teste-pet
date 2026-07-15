-- ============================================================
-- PET-CT Dose Pro — Sala Compartilhada (Supabase)
-- Cole tudo no SQL Editor do projeto e execute uma vez.
--
-- ATENÇÃO (leia antes de usar):
-- As policies abaixo são ABERTAS (anon lê/escreve tudo). Isso serve
-- APENAS para a fase de testes com NOME FICTÍCIO. Qualquer pessoa que
-- tenha o arquivo index.html consegue ler todas as salas.
-- Antes de qualquer dado real de paciente: trocar por Supabase Auth
-- + RLS restrita aos usuários da clínica (ver bloco comentado no fim).
--
-- Ao criar o projeto, escolha a região South America (São Paulo).
-- ============================================================

create table if not exists public.operacao (
  sala_id    text primary key,
  cfg        jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.pacientes (
  id         text not null,
  sala_id    text not null references public.operacao(sala_id) on delete cascade,
  nome       text default '',
  peso       text default '',
  h_sim      text default '',
  f_min      text default '',
  f_max      text default '',
  dose_real  text default '',
  updated_at timestamptz not null default now(),
  primary key (sala_id, id)
);

create index if not exists pacientes_sala_idx on public.pacientes (sala_id);

-- Restringe códigos de sala ao formato gerado pelo aplicativo.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'operacao_sala_id_formato_chk'
      and conrelid = 'public.operacao'::regclass
  ) then
    alter table public.operacao
      add constraint operacao_sala_id_formato_chk
      check (sala_id ~ '^[A-HJ-NP-Z2-9]{10}$');
  end if;
end $$;

alter table public.operacao  enable row level security;
alter table public.pacientes enable row level security;

-- ---------- TEMPORÁRIO: acesso anônimo (só para teste c/ nome fictício) ----------
drop policy if exists teste_aberto_op  on public.operacao;
drop policy if exists teste_aberto_pac on public.pacientes;
create policy teste_aberto_op  on public.operacao  for all using (true) with check (true);
create policy teste_aberto_pac on public.pacientes for all using (true) with check (true);

-- ---------- Realtime ----------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'operacao'
  ) then
    alter publication supabase_realtime add table public.operacao;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'pacientes'
  ) then
    alter publication supabase_realtime add table public.pacientes;
  end if;
end $$;

-- ============================================================
-- PARA PRODUÇÃO (dado real) — substituir as policies acima por algo assim,
-- depois de habilitar Supabase Auth e cadastrar os usuários da clínica:
--
-- drop policy teste_aberto_op  on public.operacao;
-- drop policy teste_aberto_pac on public.pacientes;
--
-- create table public.sala_membros (
--   sala_id text references public.operacao(sala_id) on delete cascade,
--   user_id uuid references auth.users(id) on delete cascade,
--   primary key (sala_id, user_id)
-- );
-- alter table public.sala_membros enable row level security;
--
-- create policy membro_proprio on public.sala_membros for select
--   using (user_id = auth.uid());
--
-- create policy membro_op on public.operacao for all
--   using  (exists (select 1 from public.sala_membros m
--                   where m.sala_id = operacao.sala_id and m.user_id = auth.uid()))
--   with check (exists (select 1 from public.sala_membros m
--                   where m.sala_id = operacao.sala_id and m.user_id = auth.uid()));
--
-- create policy membro_pac on public.pacientes for all
--   using  (exists (select 1 from public.sala_membros m
--                   where m.sala_id = pacientes.sala_id and m.user_id = auth.uid()))
--   with check (exists (select 1 from public.sala_membros m
--                   where m.sala_id = pacientes.sala_id and m.user_id = auth.uid()));
-- ============================================================
