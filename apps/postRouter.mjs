import { Router } from "express"
import postValidation from "../middleware/postValidation.mjs"
import connectionPool from "../utils/db.mjs"
import protectAdmin from "../middleware/protectAdmin.mjs";
import protectUser from "../middleware/protectUser.mjs";
import multer from "multer";
import {
  getPostImagePath,
  uploadImageToStorage,
} from "../utils/supabaseStorage.mjs";
import { createNotification } from "../utils/notificationHelpers.mjs";
import { getOptionalUserId } from "../utils/optionalUser.mjs";

const postRouter = Router()

const multerUpload = multer({ storage: multer.memoryStorage() });

const imageFileUpload = multerUpload.fields([
    { name: "imageFile", maxCount: 1 },
]);

postRouter.post("/",[imageFileUpload,postValidation,protectAdmin], async (req,res) =>{
    try{
        const {title, category_id, description, content, status_id} = req.body
        const file = req.files.imageFile[0]
        const filePath = getPostImagePath(file.originalname)
        const publicUrl = await uploadImageToStorage({
            file,
            filePath,
            authHeader: req.headers.authorization,
        })

        const userId = req.user.id

        const result = await connectionPool.query(
            `
            insert into posts (title,image,category_id,description,content,status_id,user_id,date)
            values($1,$2,$3,$4,$5,$6,$7, NOW())
            `,[title,publicUrl,category_id,description,content,status_id,userId]
        )
        
        return res.status(201).json({ "message": "Created post successfully" })
    }catch(error){
        return res.status(500).json({ "message": "Server could not create post because database connection",error: error.message })
    }
})

postRouter.get("/", async (req,res) =>{
    try{
        const title = req.query.title ? `%${req.query.title}%` : null
        const description = req.query.description ? `%${req.query.description}%` : null
        const content = req.query.content ? `%${req.query.content}%` : null
        const category = req.query.category ? `%${req.query.category}%` : null

        const page = req.query.page || 1
        const PAGE_SIZE = 6
        const offset = (page-1) * PAGE_SIZE

        const result = await connectionPool.query(
            `
            select posts.id,
                posts.title,
                posts.image,
                (posts.date AT TIME ZONE 'UTC') as date,
                categories.name as category,
                posts.description,
                posts.content,
                statuses.status,
                coalesce(users.name, 'Thompson P.') as author,
                users.profile_pic as author_avatar,
                coalesce(posts.likes_count, 0) as likes
            from posts
            inner join categories
            on posts.category_id = categories.id
            inner join statuses
            on posts.status_id = statuses.id
            left join users
            on posts.user_id = users.id
            where (posts.title ilike $1 or $1 is null) and 
                (posts.description ilike $2 or $2 is null) and 
                (posts.content ilike $3 or $3 is null) and
                (categories.name ilike $4 or $4 is null)
            limit $5 offset $6
            `,[title,description,content,category,PAGE_SIZE,offset]
        )
        return res.status(200).json({data: result.rows})
    }catch(error){
        return res.status(500).json({ "message": "Server could not read post because database connection" })
    }
})

postRouter.get("/:postId/comments", async (req, res) => {
    try {
        const postId = Number(req.params.postId)

        if (!Number.isInteger(postId) || postId < 1) {
            return res.status(400).json({ message: "Invalid post id" })
        }

        const result = await connectionPool.query(
            `
            select comments.id,
                comments.comment_text,
                (comments.created_at AT TIME ZONE 'UTC') as created_at,
                users.name as author,
                users.profile_pic as author_avatar
            from comments
            inner join users
            on comments.user_id = users.id
            where comments.post_id = $1
            order by comments.created_at asc
            `,
            [postId]
        )

        return res.status(200).json({ data: result.rows })
    } catch (error) {
        return res.status(500).json({ message: "Server could not read comments because database connection" })
    }
})

postRouter.post("/:postId/comments", protectUser, async (req, res) => {
    try {
        const postId = Number(req.params.postId)
        const commentText =
            typeof req.body?.comment_text === "string" ? req.body.comment_text.trim() : ""

        if (!Number.isInteger(postId) || postId < 1) {
            return res.status(400).json({ message: "Invalid post id" })
        }

        if (!commentText) {
            return res.status(400).json({ message: "Comment is required" })
        }

        const postCheck = await connectionPool.query(
            `select id from posts where id = $1`,
            [postId]
        )

        if (postCheck.rows.length === 0) {
            return res.status(404).json({ message: "Server could not find a requested post" })
        }

        const userId = req.user.id

        const insertResult = await connectionPool.query(
            `
            insert into comments (post_id, user_id, comment_text)
            values ($1, $2, $3)
            returning id, comment_text, (created_at AT TIME ZONE 'UTC') as created_at
            `,
            [postId, userId, commentText]
        )

        const userResult = await connectionPool.query(
            `
            select name, profile_pic
            from users
            where id = $1
            `,
            [userId]
        )

        const comment = {
            ...insertResult.rows[0],
            author: userResult.rows[0]?.name ?? "User",
            author_avatar: userResult.rows[0]?.profile_pic ?? null,
        }

        await createNotification({
            type: "comment",
            postId,
            actorUserId: userId,
            commentText,
        })

        return res.status(201).json({ data: comment })
    } catch (error) {
        return res.status(500).json({ message: "Server could not create comment because database connection" })
    }
})

postRouter.get("/:postId/likes", async (req, res) => {
    try {
        const postId = Number(req.params.postId)

        if (!Number.isInteger(postId) || postId < 1) {
            return res.status(400).json({ message: "Invalid post id" })
        }

        const userId = await getOptionalUserId(req)

        const countResult = await connectionPool.query(
            `select coalesce(likes_count, 0) as count from posts where id = $1`,
            [postId]
        )

        if (countResult.rows.length === 0) {
            return res.status(404).json({ message: "Server could not find a requested post" })
        }

        let liked = false

        if (userId) {
            const likeResult = await connectionPool.query(
                `select id from likes where post_id = $1 and user_id = $2`,
                [postId, userId]
            )
            liked = likeResult.rows.length > 0
        }

        return res.status(200).json({
            data: {
                count: Number(countResult.rows[0].count),
                liked,
            },
        })
    } catch (error) {
        return res.status(500).json({ message: "Server could not read likes because database connection" })
    }
})

postRouter.post("/:postId/likes", protectUser, async (req, res) => {
    try {
        const postId = Number(req.params.postId)
        const userId = req.user.id

        if (!Number.isInteger(postId) || postId < 1) {
            return res.status(400).json({ message: "Invalid post id" })
        }

        const postCheck = await connectionPool.query(
            `select id from posts where id = $1`,
            [postId]
        )

        if (postCheck.rows.length === 0) {
            return res.status(404).json({ message: "Server could not find a requested post" })
        }

        const existingLike = await connectionPool.query(
            `select id from likes where post_id = $1 and user_id = $2`,
            [postId, userId]
        )

        if (existingLike.rows.length > 0) {
            await connectionPool.query(
                `delete from likes where post_id = $1 and user_id = $2`,
                [postId, userId]
            )
            await connectionPool.query(
                `
                update posts
                set likes_count = greatest(coalesce(likes_count, 0) - 1, 0)
                where id = $1
                `,
                [postId]
            )

            const countResult = await connectionPool.query(
                `select coalesce(likes_count, 0) as count from posts where id = $1`,
                [postId]
            )

            return res.status(200).json({
                data: {
                    liked: false,
                    count: Number(countResult.rows[0].count),
                },
            })
        }

        await connectionPool.query(
            `insert into likes (post_id, user_id) values ($1, $2)`,
            [postId, userId]
        )
        await connectionPool.query(
            `
            update posts
            set likes_count = coalesce(likes_count, 0) + 1
            where id = $1
            `,
            [postId]
        )

        await createNotification({
            type: "like",
            postId,
            actorUserId: userId,
        })

        const countResult = await connectionPool.query(
            `select coalesce(likes_count, 0) as count from posts where id = $1`,
            [postId]
        )

        return res.status(201).json({
            data: {
                liked: true,
                count: Number(countResult.rows[0].count),
            },
        })
    } catch (error) {
        return res.status(500).json({ message: "Server could not update like because database connection" })
    }
})

postRouter.get("/:postId",async (req,res) =>{
    try{
        const id = req.params.postId
        const result = await connectionPool.query(
            `
            select posts.id,
                posts.title,
                posts.image,
                (posts.date AT TIME ZONE 'UTC') as date,
                categories.name as category,
                posts.description,
                posts.content,
                statuses.status,
                coalesce(users.name, 'Thompson P.') as author,
                users.profile_pic as author_avatar,
                coalesce(posts.likes_count, 0) as likes
            from posts
            inner join categories
            on posts.category_id = categories.id
            inner join statuses
            on posts.status_id = statuses.id
            left join users
            on posts.user_id = users.id
            where posts.id = $1
            `,[id]
        )
        if(result.rows.length === 0){
            return res.status(404).json({ "message": "Server could not find a requested post" })
        }
        return res.status(200).json({ data: result.rows[0] })
    }catch(error){
        return res.status(500).json({ "message": "Server could not read post because database connection" })
    }
})  

postRouter.put("/:postId",[imageFileUpload,postValidation,protectAdmin], async (req,res) =>{
    try{
        const id = req.params.postId
        const {title, category_id, description, content, status_id} = req.body
        const file = req.files?.imageFile?.[0]
        const userId = req.user.id

        if (file) {
            const filePath = getPostImagePath(file.originalname)
            const publicUrl = await uploadImageToStorage({
                file,
                filePath,
                authHeader: req.headers.authorization,
            })

            const result = await connectionPool.query(
                `
                update posts
                set title=$1,image=$2,category_id=$3,description=$4,content=$5,status_id=$6,user_id=coalesce(user_id, $8)
                where id = $7
                returning *
                `,[title,publicUrl,category_id,description,content,status_id,id,userId]
            )
            if(result.rows.length===0){
                return res.status(404).json({ "message": "Server could not find a requested post to update" })
            }
            return res.status(200).json({ "message": "Updated post successfully" })
        }

        const result = await connectionPool.query(
            `
            update posts
            set title=$1,category_id=$2,description=$3,content=$4,status_id=$5,user_id=coalesce(user_id, $7)
            where id = $6
            returning *
            `,[title,category_id,description,content,status_id,id,userId]
        )
        if(result.rows.length===0){
            return res.status(404).json({ "message": "Server could not find a requested post to update" })
        }
        return res.status(200).json({ "message": "Updated post successfully" })
    }catch(error){
        return res.status(500).json({ "message": "Server could not update post because database connection" })
    }
})

postRouter.delete("/:postId",async (req,res) =>{
    try{
        const id = req.params.postId
        const result = await connectionPool.query(
            `
            delete from posts
            where id = $1
            returning *
            `,[id]
        )
        if(result.rows.length === 0){
            return res.status(404).json({ "message": "Server could not find a requested post to delete" })
        }
        return res.status(200).json({ "message": "Deleted post successfully" })
    }catch(error){
        return res.status(500).json({ "message": "Server could not delete post because database connection" })
    }
})

export default postRouter