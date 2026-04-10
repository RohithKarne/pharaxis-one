export async function logSuperadminAction(client, action) {
  const sql = `
    INSERT INTO sa_user_admin_actions (
      org_id,
      actor_user_id,
      action_key,
      target_entity_type,
      target_entity_id,
      details_json
    ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
  `;

  await client.query(sql, [
    action.orgId,
    action.actorUserId,
    action.actionKey,
    action.targetEntityType,
    action.targetEntityId || null,
    JSON.stringify(action.detailsJson || {})
  ]);
}

