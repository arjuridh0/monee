CREATE TABLE account_credentials (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  pin_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  iterations INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE auth_verifications (
  token_hash TEXT PRIMARY KEY,
  intent TEXT NOT NULL CHECK(intent IN ('register', 'recover', 'activate')),
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  email TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  consumed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX auth_verifications_expiry ON auth_verifications(expires_at);
CREATE TABLE auth_attempts (
  scope TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  window_at INTEGER NOT NULL,
  blocked_until INTEGER NOT NULL DEFAULT 0
);
