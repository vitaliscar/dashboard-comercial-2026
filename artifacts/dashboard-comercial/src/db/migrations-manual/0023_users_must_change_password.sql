-- Flag de primer ingreso: tras login con clave temporal el usuario
-- elige cambiar o mantener (ver FirstLoginPasswordDialog).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
