-- CPPM-17: keep a record of every chat box conversation.
--
-- The chat box was the one way into the portal that kept nothing: the question,
-- the answer, the time and who asked were lost when the window closed. Each
-- conversation and each turn in it is now stored, per client, for staff to read.
--
-- client_id is repeated on messages so every read can filter by tenant without a
-- join. Only the new user turn and our own reply are stored: the history the
-- browser resends for context is client-supplied and is not trusted or re-saved.
--
-- Definition matches database/db.js exactly so the two paths cannot drift.
CREATE TABLE IF NOT EXISTS cp_chat_conversations (
  id               INT          NOT NULL AUTO_INCREMENT,
  client_id        INT          NOT NULL,
  portal_user_id   INT          NULL,
  user_type        VARCHAR(50)  NULL,
  provider         VARCHAR(30)  NULL,
  model            VARCHAR(100) NULL,
  message_count    INT          NOT NULL DEFAULT 0,
  started_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_message_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_chatconv_client (client_id, last_message_at),
  KEY idx_chatconv_user (portal_user_id),
  CONSTRAINT fk_chatconv_client FOREIGN KEY (client_id) REFERENCES cp_clients(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS cp_chat_messages (
  id               INT          NOT NULL AUTO_INCREMENT,
  conversation_id  INT          NOT NULL,
  client_id        INT          NOT NULL,
  role             VARCHAR(20)  NOT NULL,
  content          MEDIUMTEXT   NOT NULL,
  sources_json     TEXT         NULL,
  outcome          VARCHAR(20)  NULL,
  latency_ms       INT          NULL,
  created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_chatmsg_conv (conversation_id, id),
  KEY idx_chatmsg_client (client_id, created_at),
  CONSTRAINT fk_chatmsg_conv FOREIGN KEY (conversation_id) REFERENCES cp_chat_conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
