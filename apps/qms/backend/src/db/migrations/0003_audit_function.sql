CREATE OR REPLACE FUNCTION qms_append_audit_event(
  p_org_id UUID,
  p_module_key TEXT,
  p_entity_table TEXT,
  p_entity_id UUID,
  p_action_key TEXT,
  p_actor_user_id UUID,
  p_payload_json JSONB
) RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_prev_hash TEXT;
  v_curr_hash TEXT;
  v_event_id BIGINT;
  v_occurred_at TIMESTAMPTZ;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_org_id::text, 0));

  SELECT curr_hash
    INTO v_prev_hash
  FROM qms_audit_events
  WHERE org_id = p_org_id
  ORDER BY id DESC
  LIMIT 1;

  v_occurred_at := now();

  v_curr_hash := encode(
    digest(
      coalesce(v_prev_hash, 'GENESIS') || '|' ||
      p_org_id::text || '|' ||
      p_module_key || '|' ||
      p_entity_table || '|' ||
      p_entity_id::text || '|' ||
      p_action_key || '|' ||
      coalesce(p_actor_user_id::text, 'SYSTEM') || '|' ||
      coalesce(p_payload_json::text, '{}') || '|' ||
      v_occurred_at::text,
      'sha256'
    ),
    'hex'
  );

  INSERT INTO qms_audit_events (
    org_id,
    module_key,
    entity_table,
    entity_id,
    action_key,
    actor_user_id,
    payload_json,
    occurred_at,
    prev_hash,
    curr_hash
  )
  VALUES (
    p_org_id,
    p_module_key,
    p_entity_table,
    p_entity_id,
    p_action_key,
    p_actor_user_id,
    coalesce(p_payload_json, '{}'::jsonb),
    v_occurred_at,
    v_prev_hash,
    v_curr_hash
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;
