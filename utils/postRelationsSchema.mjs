import connectionPool from './db.mjs'

let schemaReadyPromise = null

async function ensurePostCascade(tableName, columnName) {
  const constraintName = `${tableName}_${columnName}_fkey`

  const tableExists = await connectionPool.query(
    `
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = $1
    `,
    [tableName]
  )

  if (tableExists.rows.length === 0) return

  await connectionPool.query(
    `ALTER TABLE ${tableName} DROP CONSTRAINT IF EXISTS ${constraintName}`
  )

  await connectionPool.query(
    `
    ALTER TABLE ${tableName}
    ADD CONSTRAINT ${constraintName}
    FOREIGN KEY (${columnName}) REFERENCES posts(id) ON DELETE CASCADE
    `
  )
}

export async function ensurePostRelationsSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = Promise.all([
      ensurePostCascade('comments', 'post_id'),
      ensurePostCascade('likes', 'post_id'),
    ]).catch((error) => {
      schemaReadyPromise = null
      console.error('Failed to ensure post relation cascades:', error.message)
    })
  }

  return schemaReadyPromise
}
