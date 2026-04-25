const schemaSql = `
CREATE TABLE IF NOT EXISTS doffice_organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  type TEXT DEFAULT 'root',
  status TEXT NOT NULL DEFAULT 'active',
  logo TEXT,
  parent_id TEXT REFERENCES doffice_organizations(id),
  depth INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE doffice_organizations ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'root';
ALTER TABLE doffice_organizations ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE doffice_organizations ADD COLUMN IF NOT EXISTS logo TEXT;
ALTER TABLE doffice_organizations ADD COLUMN IF NOT EXISTS parent_id TEXT REFERENCES doffice_organizations(id);
ALTER TABLE doffice_organizations ADD COLUMN IF NOT EXISTS depth INTEGER NOT NULL DEFAULT 0;
ALTER TABLE doffice_organizations ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE doffice_organizations ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE doffice_organizations ADD COLUMN IF NOT EXISTS updated_by TEXT;
ALTER TABLE doffice_organizations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE doffice_organizations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE doffice_organizations ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS doffice_organizations_code_unique_active
  ON doffice_organizations (LOWER(code))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS doffice_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT,
  employee_id TEXT,
  designation TEXT,
  department TEXT,
  bio TEXT,
  avatar TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  contact_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  org_id TEXT REFERENCES doffice_organizations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE doffice_users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE doffice_users ADD COLUMN IF NOT EXISTS employee_id TEXT;
ALTER TABLE doffice_users ADD COLUMN IF NOT EXISTS designation TEXT;
ALTER TABLE doffice_users ADD COLUMN IF NOT EXISTS department TEXT;
ALTER TABLE doffice_users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE doffice_users ADD COLUMN IF NOT EXISTS avatar TEXT;
ALTER TABLE doffice_users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE doffice_users ADD COLUMN IF NOT EXISTS contact_info JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE doffice_users ADD COLUMN IF NOT EXISTS org_id TEXT REFERENCES doffice_organizations(id);
ALTER TABLE doffice_users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE doffice_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE doffice_users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS doffice_users_username_unique_active
  ON doffice_users (LOWER(username))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS doffice_users_email_unique_active
  ON doffice_users (LOWER(email))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS doffice_roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'system',
  inherits_from TEXT,
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  org_id TEXT REFERENCES doffice_organizations(id),
  is_system BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE doffice_roles ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE doffice_roles ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'system';
ALTER TABLE doffice_roles ADD COLUMN IF NOT EXISTS inherits_from TEXT;
ALTER TABLE doffice_roles ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE doffice_roles ADD COLUMN IF NOT EXISTS org_id TEXT REFERENCES doffice_organizations(id);
ALTER TABLE doffice_roles ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE doffice_roles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE doffice_roles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE doffice_roles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS doffice_user_roles (
  user_id TEXT NOT NULL REFERENCES doffice_users(id),
  role_id TEXT NOT NULL REFERENCES doffice_roles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS doffice_user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES doffice_users(id),
  access_token_hash TEXT,
  refresh_token_hash TEXT,
  token_jti TEXT NOT NULL,
  refresh_jti TEXT NOT NULL,
  is_revoked BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  refresh_expires_at TIMESTAMPTZ NOT NULL,
  device_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip TEXT,
  user_agent TEXT,
  revoked_at TIMESTAMPTZ,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (token_jti),
  UNIQUE (refresh_jti)
);

ALTER TABLE doffice_user_sessions ADD COLUMN IF NOT EXISTS access_token_hash TEXT;
ALTER TABLE doffice_user_sessions ADD COLUMN IF NOT EXISTS refresh_token_hash TEXT;
ALTER TABLE doffice_user_sessions ADD COLUMN IF NOT EXISTS token_jti TEXT;
ALTER TABLE doffice_user_sessions ADD COLUMN IF NOT EXISTS refresh_jti TEXT;
ALTER TABLE doffice_user_sessions ADD COLUMN IF NOT EXISTS is_revoked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE doffice_user_sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE doffice_user_sessions ADD COLUMN IF NOT EXISTS refresh_expires_at TIMESTAMPTZ;
ALTER TABLE doffice_user_sessions ADD COLUMN IF NOT EXISTS device_info JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE doffice_user_sessions ADD COLUMN IF NOT EXISTS ip TEXT;
ALTER TABLE doffice_user_sessions ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE doffice_user_sessions ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE doffice_user_sessions ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE doffice_user_sessions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE doffice_user_sessions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS doffice_organization_relationships (
  id TEXT PRIMARY KEY,
  source_org_id TEXT NOT NULL REFERENCES doffice_organizations(id),
  target_org_id TEXT NOT NULL REFERENCES doffice_organizations(id),
  type TEXT NOT NULL,
  description TEXT,
  shared_modules JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by TEXT NOT NULL REFERENCES doffice_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE doffice_organization_relationships ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE doffice_organization_relationships ADD COLUMN IF NOT EXISTS shared_modules JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE doffice_organization_relationships ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES doffice_users(id);
ALTER TABLE doffice_organization_relationships ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE doffice_organization_relationships ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS doffice_organization_nav_configs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES doffice_organizations(id),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE doffice_organization_nav_configs ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE doffice_organization_nav_configs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE doffice_organization_nav_configs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE doffice_organization_nav_configs ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS doffice_org_nav_config_org_unique_active
  ON doffice_organization_nav_configs (org_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS doffice_api_audits (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES doffice_users(id),
  action TEXT NOT NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER,
  resource_type TEXT,
  resource_id TEXT,
  ip TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE doffice_api_audits ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES doffice_users(id);
ALTER TABLE doffice_api_audits ADD COLUMN IF NOT EXISTS status_code INTEGER;
ALTER TABLE doffice_api_audits ADD COLUMN IF NOT EXISTS resource_type TEXT;
ALTER TABLE doffice_api_audits ADD COLUMN IF NOT EXISTS resource_id TEXT;
ALTER TABLE doffice_api_audits ADD COLUMN IF NOT EXISTS ip TEXT;
ALTER TABLE doffice_api_audits ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE doffice_api_audits ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE doffice_api_audits ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS doffice_sessions_token_jti_unique ON doffice_user_sessions(token_jti);
CREATE UNIQUE INDEX IF NOT EXISTS doffice_sessions_refresh_jti_unique ON doffice_user_sessions(refresh_jti);

CREATE INDEX IF NOT EXISTS doffice_idx_org_parent ON doffice_organizations(parent_id);
CREATE INDEX IF NOT EXISTS doffice_idx_users_org ON doffice_users(org_id);
CREATE INDEX IF NOT EXISTS doffice_api_idx_audits_user_created ON doffice_api_audits(user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS doffice_uniq_org_relationship_active
  ON doffice_organization_relationships (source_org_id, target_org_id, type)
  WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'doffice_organizations_status_check'
  ) THEN
    ALTER TABLE doffice_organizations
      ADD CONSTRAINT doffice_organizations_status_check
      CHECK (status IN ('active', 'archived', 'deactivated'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'doffice_organization_relationships_not_self'
  ) THEN
    ALTER TABLE doffice_organization_relationships
      ADD CONSTRAINT doffice_organization_relationships_not_self
      CHECK (source_org_id <> target_org_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'doffice_organizations_parent_not_self'
  ) THEN
    ALTER TABLE doffice_organizations
      ADD CONSTRAINT doffice_organizations_parent_not_self
      CHECK (parent_id IS NULL OR parent_id <> id);
  END IF;
END $$;
`;

module.exports = { schemaSql };
