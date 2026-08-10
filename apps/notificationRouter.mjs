import { Router } from 'express'
import connectionPool from '../utils/db.mjs'
import protectAdmin from '../middleware/protectAdmin.mjs'

const notificationRouter = Router()

notificationRouter.get('/', protectAdmin, async (req, res) => {
  try {
    const result = await connectionPool.query(
      `
      SELECT
        notifications.id,
        notifications.type,
        notifications.comment_text AS comment,
        notifications.read,
        (notifications.created_at AT TIME ZONE 'UTC') AS created_at,
        posts.id AS article_id,
        posts.title AS article_title,
        users.name AS user_name,
        users.profile_pic AS user_avatar
      FROM notifications
      INNER JOIN posts ON notifications.post_id = posts.id
      INNER JOIN users ON notifications.actor_user_id = users.id
      ORDER BY notifications.created_at DESC
      `
    )

    return res.status(200).json({ data: result.rows })
  } catch (error) {
    return res.status(500).json({
      message: 'Server could not read notifications because database connection',
    })
  }
})

notificationRouter.patch('/read-all', protectAdmin, async (req, res) => {
  try {
    await connectionPool.query(`UPDATE notifications SET read = TRUE WHERE read = FALSE`)
    return res.status(200).json({ message: 'All notifications marked as read' })
  } catch (error) {
    return res.status(500).json({
      message: 'Server could not update notifications because database connection',
    })
  }
})

notificationRouter.patch('/:notificationId/read', protectAdmin, async (req, res) => {
  try {
    const notificationId = Number(req.params.notificationId)

    if (!Number.isInteger(notificationId) || notificationId < 1) {
      return res.status(400).json({ message: 'Invalid notification id' })
    }

    const result = await connectionPool.query(
      `
      UPDATE notifications
      SET read = TRUE
      WHERE id = $1
      RETURNING id
      `,
      [notificationId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Notification not found' })
    }

    return res.status(200).json({ message: 'Notification marked as read' })
  } catch (error) {
    return res.status(500).json({
      message: 'Server could not update notification because database connection',
    })
  }
})

export default notificationRouter
