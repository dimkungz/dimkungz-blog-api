import connectionPool from './db.mjs'

export async function createNotification({ type, postId, actorUserId, commentText = null }) {
  await connectionPool.query(
    `
    INSERT INTO notifications (type, post_id, actor_user_id, comment_text)
    VALUES ($1, $2, $3, $4)
    `,
    [type, postId, actorUserId, commentText]
  )
}
