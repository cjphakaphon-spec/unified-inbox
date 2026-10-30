-- Migration: 001_init_schema.sql
-- Description: Initial schema for Unified Inbox (channels, customers, identities, agents, conversations, messages)

CREATE TABLE IF NOT EXISTS channels (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('line', 'messenger')),
  name TEXT NOT NULL,
  external_id TEXT
);

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS identities (
  id SERIAL PRIMARY KEY,
  customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
  channel_id INT REFERENCES channels(id) ON DELETE CASCADE,
  external_user_id TEXT NOT NULL,
  UNIQUE (channel_id, external_user_id)
);

CREATE TABLE IF NOT EXISTS agents (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'agent'
);

CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  customer_id INT REFERENCES customers(id) ON DELETE CASCADE,
  channel_id INT REFERENCES channels(id) ON DELETE CASCADE,
  identity_id INT REFERENCES identities(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  assigned_to INT REFERENCES agents(id) ON DELETE SET NULL,
  unread_count INT DEFAULT 0,
  last_message_at TIMESTAMPTZ,
  last_customer_message_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id INT REFERENCES conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  type TEXT NOT NULL,
  text TEXT,
  media_url TEXT,
  raw JSONB,
  external_msg_id TEXT,
  sent_by INT REFERENCES agents(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'sent',
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (conversation_id, external_msg_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);
