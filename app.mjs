import express from "express";
import cors from "cors";
import "dotenv/config";
import connectionPool from "./utils/db.mjs";

const app = express();
const port = process.env.PORT || 4000;

app.use(
    cors({
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

app.post("/posts",async (req,res) =>{
    try{
        const {title, image, category_id, description, content, status_id} = req.body
        const result = await connectionPool.query(
            `
            insert into posts (title,image,category_id,description,content,status_id)
            values($1,$2,$3,$4,$5,$6)
            `,[title,image,category_id,description,content,status_id]
        )
        if(!title || !image || !category_id || !description || !content || !status_id){
            return res.status(400).json({ "message": "Server could not create post because there are missing data from client" })
        }
        return res.status(201).json({ "message": "Created post successfully" })
    }catch(error){
        return res.status(500).json({ "message": "Server could not create post because database connection",error: error.message })
    }
})

app.listen(port, () =>{
    console.log(`Server is running at ${port}`);
})