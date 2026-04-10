const { pool } = require('../database/db')

function formatDocNumber(prefix, typeCode, year, sequence) {
  return `${prefix}-${typeCode}-${year}-${String(sequence).padStart(5, '0')}`
}

async function generateDocNumber(orgId, contentTypeId, connectionArg = null) {
  const connection = connectionArg || (await pool.getConnection())
  const ownsConnection = !connectionArg

  try {
    if (ownsConnection) await connection.beginTransaction()

    const [[org]] = await connection.execute(
      'SELECT doc_number_prefix FROM orgs WHERE id = ? AND status = ?',
      [orgId, 'active']
    )
    if (!org) throw new Error('Organisation not found or inactive')

    const [[type]] = await connection.execute(
      'SELECT code FROM content_types WHERE id = ? AND org_id = ? AND is_active = 1',
      [contentTypeId, orgId]
    )
    if (!type) throw new Error('Content type not found or inactive for this organisation')

    const year = new Date().getFullYear()

    const [[sequenceRow]] = await connection.execute(
      `SELECT id, last_sequence
       FROM doc_number_sequences
       WHERE org_id = ? AND content_type_id = ? AND year = ?
       FOR UPDATE`,
      [orgId, contentTypeId, year]
    )

    let sequence
    if (!sequenceRow) {
      sequence = 1
      await connection.execute(
        `INSERT INTO doc_number_sequences (org_id, content_type_id, year, last_sequence)
         VALUES (?, ?, ?, ?)`,
        [orgId, contentTypeId, year, sequence]
      )
    } else {
      sequence = Number(sequenceRow.last_sequence) + 1
      await connection.execute(
        'UPDATE doc_number_sequences SET last_sequence = ? WHERE id = ?',
        [sequence, sequenceRow.id]
      )
    }

    if (ownsConnection) await connection.commit()
    return formatDocNumber(org.doc_number_prefix, type.code, year, sequence)
  } catch (error) {
    if (ownsConnection) await connection.rollback()
    throw error
  } finally {
    if (ownsConnection) connection.release()
  }
}

module.exports = { generateDocNumber }
