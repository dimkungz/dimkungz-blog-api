import { Router } from "express"
import postValidation from "../middleware/postValidation.mjs"
import connectionPool from "../utils/db.mjs"
import protectAdmin from "../middleware/protectAdmin.mjs";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);
const postRouter = Router()

const multerUpload = multer({ storage: multer.memoryStorage() });

const imageFileUpload = multerUpload.fields([
    { name: "imageFile", maxCount: 1 },
]);

postRouter.post("/",[postValidation,imageFileUpload,protectAdmin], async (req,res) =>{
    try{
        const {title, category_id, description, content, status_id} = req.body
        const file = req.files.imageFile[0]

        const bucketName = "my-personal-blog";
        const filePath = `posts/${Date.now()}_${file.originalname}`;

        const { data, error } = await supabase.storage
            .from(bucketName)
            .upload(filePath, file.buffer, {
                contentType: file.mimetype,
                upsert: false, // ป้องกันการเขียนทับไฟล์เดิม
            });
        if (error) {
            throw error;
        }

        const {
            data: { publicUrl },
        } = supabase.storage.from(bucketName).getPublicUrl(data.path);

        const result = await connectionPool.query(
            `
            insert into posts (title,image,category_id,description,content,status_id)
            values($1,$2,$3,$4,$5,$6)
            `,[title,publicUrl,category_id,description,content,status_id]
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
            select title,image,name as category,description,content,status from posts
            inner join categories
            on posts.category_id = categories.id
            inner join statuses
            on posts.status_id = statuses.id
            where (title ilike $1 or $1 is null) and 
                (description ilike $2 or $2 is null) and 
                (content ilike $3 or $3 is null) and
                (name ilike $4 or $4 is null)
            limit $5 offset $6
            `,[title,description,content,category,PAGE_SIZE,offset]
        )
        return res.status(200).json({data: result.rows})
    }catch(error){
        return res.status(500).json({ "message": "Server could not read post because database connection" })
    }
})

postRouter.get("/:postId",async (req,res) =>{
    try{
        const id = req.params.postId
        const result = await connectionPool.query(
            `
            select title,image,name as category,description,content,status from posts 
            inner join categories
            on posts.category_id = categories.id
            inner join statuses
            on posts.status_id = statuses.id
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

postRouter.put("/:postId",[postValidation,imageFileUpload,protectAdmin], async (req,res) =>{
    try{
        const id = req.params.postId
        const {title, category_id, description, content, status_id} = req.body
        const file = req.files.imageFile[0]

        const bucketName = "my-personal-blog";
        const filePath = `posts/${Date.now()}_${file.originalname}`;

        const { data, error } = await supabase.storage
            .from(bucketName)
            .upload(filePath, file.buffer, {
                contentType: file.mimetype,
                upsert: false, // ป้องกันการเขียนทับไฟล์เดิม
            });
        if (error) {
            throw error;
        }

        const {
            data: { publicUrl },
        } = supabase.storage.from(bucketName).getPublicUrl(data.path);

        const result = await connectionPool.query(
            `
            update posts
            set title=$1,image=$2,category_id=$3,description=$4,content=$5,status_id=$6
            where id = $7
            returning *
            `,[title,publicUrl,category_id,description,content,status_id,id]
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