import express from "express";
import cors from "cors";
import "dotenv/config";
import connectionPool from "./utils/db.mjs";
import postValidation from "./middleware/postValidation.mjs";

const app = express();
const port = process.env.PORT || 4000;

app.use(cors({
        origin: [
            "http://localhost:5173", // Frontend local (Vite)
            "http://localhost:3000", // Frontend local (React แบบอื่น)
            "https://dimkungz-blog.vercel.app", // Frontend ที่ Deploy แล้ว
            // ✅ ให้เปลี่ยน https://your-frontend.vercel.app เป็น URL จริงของ Frontend ที่ deploy แล้ว
        ],
    })
);
app.use(express.json());

app.get("/health", (req, res) => {
    res.status(200).json({ message: "OK" });
  });

app.post("/posts",postValidation, async (req,res) =>{
    try{
        const {title, image, category_id, description, content, status_id} = req.body

        const result = await connectionPool.query(
            `
            insert into posts (title,image,category_id,description,content,status_id)
            values($1,$2,$3,$4,$5,$6)
            `,[title,image,category_id,description,content,status_id]
        )
        
        return res.status(201).json({ "message": "Created post successfully" })
    }catch(error){
        return res.status(500).json({ "message": "Server could not create post because database connection",error: error.message })
    }
})

app.get("/posts/:postId",async (req,res) =>{
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

app.put("/posts/:postId",postValidation, async (req,res) =>{
    try{
        const id = req.params.postId
        const {title, image, category_id, description, content, status_id} = req.body

        const result = await connectionPool.query(
            `
            update posts
            set title=$1,image=$2,category_id=$3,description=$4,content=$5,status_id=$6
            where id = $7
            returning *
            `,[title,image,category_id,description,content,status_id,id]
        )
        if(result.rows.length===0){
            return res.status(404).json({ "message": "Server could not find a requested post to update" })
        }
        return res.status(200).json({ "message": "Updated post successfully" })
    }catch(error){
        return res.status(500).json({ "message": "Server could not update post because database connection" })
    }
})

app.delete("/posts/:postId",async (req,res) =>{
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

app.get("/posts", async (req,res) =>{
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

app.listen(port, () =>{
    console.log(`Server is running at ${port}`);
})