import connectionPool from './db.mjs'

let schemaReadyPromise = null

export async function ensurePostsAuthorSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = connectionPool.query(`
      ALTER TABLE posts
      ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id)
    `).catch((error) => {
      schemaReadyPromise = null
      console.error('Failed to ensure posts.user_id column:', error.message)
    })
  }

  return schemaReadyPromise
}
