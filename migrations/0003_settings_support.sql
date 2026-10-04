ALTER TABLE users ADD COLUMN language TEXT NOT NULL DEFAULT 'fa';

CREATE TABLE IF NOT EXISTS support_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_telegram_id INTEGER NOT NULL,
  owner_message_id INTEGER,
  user_message_id INTEGER,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_support_owner_message ON support_messages(owner_message_id);
CREATE INDEX IF NOT EXISTS idx_support_user ON support_messages(user_telegram_id);
