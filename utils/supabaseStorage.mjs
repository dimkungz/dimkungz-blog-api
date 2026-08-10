import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
export const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'dimkungz-blog'

let bucketReadyPromise = null

function getServiceClient() {
  if (!supabaseServiceRoleKey) {
    return null
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey)
}

export function getSupabaseUserClient(authHeader) {
  const token = authHeader?.split(' ')[1]

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : {},
    },
  })
}

export async function ensureStorageBucket() {
  const serviceClient = getServiceClient()
  if (!serviceClient) return

  if (!bucketReadyPromise) {
    bucketReadyPromise = (async () => {
      const { data: buckets, error: listError } = await serviceClient.storage.listBuckets()

      if (listError) {
        throw listError
      }

      const exists = buckets?.some((bucket) => bucket.name === STORAGE_BUCKET)

      if (!exists) {
        const { error: createError } = await serviceClient.storage.createBucket(STORAGE_BUCKET, {
          public: true,
          fileSizeLimit: 5 * 1024 * 1024,
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        })

        if (createError && !createError.message?.toLowerCase().includes('already exists')) {
          throw createError
        }
      }
    })()
  }

  return bucketReadyPromise
}

export function getProfileImagePath(userId, mimetype) {
  const extensionMap = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  }

  const extension = extensionMap[mimetype] || 'jpg'

  return `profiles/${userId}/${Date.now()}.${extension}`
}

export function getPostImagePath(originalname) {
  const safeName = originalname.replace(/[^\w.-]/g, '_')

  return `posts/${Date.now()}_${safeName}`
}

export async function uploadImageToStorage({ file, filePath, authHeader }) {
  await ensureStorageBucket()

  const uploadWithClient = (client) =>
    client.storage.from(STORAGE_BUCKET).upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: true,
    })

  const serviceClient = getServiceClient()
  const userClient = getSupabaseUserClient(authHeader)
  const uploadClient = serviceClient ?? userClient

  let { data, error } = await uploadWithClient(uploadClient)

  if (error && serviceClient && uploadClient !== userClient) {
    ;({ data, error } = await uploadWithClient(userClient))
  }

  if (error) {
    throw error
  }

  const {
    data: { publicUrl },
  } = uploadClient.storage.from(STORAGE_BUCKET).getPublicUrl(data.path)

  return publicUrl
}
