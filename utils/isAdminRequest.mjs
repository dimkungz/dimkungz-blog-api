import { createClient } from '@supabase/supabase-js'
import connectionPool from './db.mjs'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
)

export async function isAdminRequest(req) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) return false

  try {
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data.user) return false

    const { rows } = await connectionPool.query(
      `SELECT role FROM users WHERE id = $1`,
      [data.user.id]
    )

    return rows[0]?.role === 'admin'
  } catch {
    return false
  }
}
