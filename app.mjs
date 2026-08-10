import express from "express";
import cors from "cors";
import "dotenv/config";
import postRouter from "./apps/postRouter.mjs";
import authRouter from "./apps/auth.mjs";
import notificationRouter from "./apps/notificationRouter.mjs";
import protectUser from "./middleware/protectUser.mjs";
import protectAdmin from "./middleware/protectAdmin.mjs";

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

app.get("/protected-route", protectUser, (req, res) => {
    res.json({ message: "This is protected content", user: req.user });
});
  
app.get("/admin-only", protectAdmin, (req, res) => {
    res.json({ message: "This is admin-only content", admin: req.user });
});

app.use("/auth", authRouter)

app.use("/notifications", notificationRouter)

app.use("/posts", postRouter)

app.listen(port, () => {
    console.log(`Server is running at ${port}`);
});

export default app