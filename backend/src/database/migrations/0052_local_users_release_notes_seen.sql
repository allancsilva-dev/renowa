-- Última versão das "Novidades" que o usuário já viu (modal pós-atualização).
-- Por tenant/usuário (local_users), não por navegador: fechar o modal em um
-- aparelho vale para todos. NULL = nunca viu nenhuma; o front mostra só a
-- versão mais recente nesse caso. Formato X.Y.Z, validado no DTO.
ALTER TABLE public.local_users
  ADD COLUMN IF NOT EXISTS release_notes_seen_version varchar(32);
