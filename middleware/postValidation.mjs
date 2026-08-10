function postValidation(req, res, next) {
  const { title, description, content } = req.body
  const categoryId = Number(req.body.category_id)
  const statusId = Number(req.body.status_id)
  const hasImageFile = Boolean(req.files?.imageFile?.[0])
  const isUpdate = req.method === 'PUT'

  if (!title) {
    return res.status(400).json({ message: 'Title is required' })
  }

  if (!hasImageFile && !isUpdate) {
    return res.status(400).json({ message: 'Image is required' })
  }

  if (!Number.isInteger(categoryId)) {
    return res.status(400).json({ message: 'Category ID must be a number' })
  }

  if (!description) {
    return res.status(400).json({ message: 'Description is required' })
  }

  if (!content) {
    return res.status(400).json({ message: 'Content is required' })
  }

  if (!Number.isInteger(statusId)) {
    return res.status(400).json({ message: 'Status ID must be a number' })
  }

  if (typeof title !== 'string') {
    return res.status(400).json({ message: 'Title must be a string' })
  }

  if (typeof description !== 'string') {
    return res.status(400).json({ message: 'Description is must be a string' })
  }

  if (typeof content !== 'string') {
    return res.status(400).json({ message: 'Content is must be a string' })
  }

  req.body.category_id = categoryId
  req.body.status_id = statusId

  next()
}

export default postValidation
