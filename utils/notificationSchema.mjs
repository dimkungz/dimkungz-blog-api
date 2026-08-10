import connectionPool from './db.mjs'

let schemaReadyPromise = null

export async function ensureNotificationsSchema() {
  if (!schemaReadyPromise) {
    schemaReadyPromise = connectionPool
      .query(`
        CREATE TABLE IF NOT EXISTS notifications (
          id SERIAL PRIMARY KEY,
          type VARCHAR(20) NOT NULL CHECK (type IN ('comment', 'like')),
          post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
          actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          comment_text TEXT,
          read BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
        );

        CREATE UNIQUE INDEX IF NOT EXISTS likes_post_user_unique
        ON likes (post_id, user_id);
      `)
      .catch((error) => {
        schemaReadyPromise = null
        console.error('Failed to ensure notifications schema:', error.message)
      })
  }

  return schemaReadyPromise
}
