ALTER TABLE public.usuarios
  ADD COLUMN IF NOT EXISTS access_token_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.usuarios
  DROP CONSTRAINT IF EXISTS usuarios_access_token_version_positive;

ALTER TABLE public.usuarios
  ADD CONSTRAINT usuarios_access_token_version_positive
  CHECK (access_token_version > 0);
