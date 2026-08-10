import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import multer from "multer";
import connectionPool from "../utils/db.mjs";
import {
  getProfileImagePath,
  uploadImageToStorage,
} from "../utils/supabaseStorage.mjs";

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);
const authRouter = Router();
const multerUpload = multer({ storage: multer.memoryStorage() });
const profilePicUpload = multerUpload.single("profilePic");

async function getAuthUserId(req) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) {
    return { error: "Unauthorized: Token missing", status: 401 };
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return { error: "Unauthorized or token expired", status: 401 };
  }

  return { userId: data.user.id };
}

authRouter.post("/register", async (req, res) => {
    const { email, password, username, name } = req.body;
    try {
      const usernameCheckQuery = `
        SELECT * FROM users
        WHERE username = $1
      `;
      const usernameCheckValues = [username];
      const { rows: existingUser } = await connectionPool.query(
        usernameCheckQuery,
        usernameCheckValues
      );
      if (existingUser.length > 0) {
        return res.status(400).json({ error: "This username is already taken" });
      }
  
      const { data, error: supabaseError } = await supabase.auth.signUp({
        email,
        password,
      });
      if (supabaseError) {
        if (supabaseError.code === "user_already_exists") {
          return res
            .status(400)
            .json({ error: "User with this email already exists" });
        }
        return res
          .status(400)
          .json({ error: "Failed to create user. Please try again." });
      }
  
      const supabaseUserId = data.user.id;
      const query = `
        INSERT INTO users (id, username, name, role)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
      `;
      const values = [supabaseUserId, username, name, "user"];
      const { rows } = await connectionPool.query(query, values);
      res.status(201).json({
        message: "User created successfully",
        user: rows[0],
      });
    } catch (error) {
      res.status(500).json({ error: "An error occurred during registration" });
    }
});

authRouter.post("/login", async (req, res) => {
    const { email, password } = req.body;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        if (
          error.code === "invalid_credentials" ||
          error.message.includes("Invalid login credentials")
        ) {
          return res.status(400).json({
            error: "Your password is incorrect or this email doesn't exist",
          });
        }
        return res.status(400).json({ error: error.message });
      }
      return res.status(200).json({
        message: "Signed in successfully",
        access_token: data.session.access_token,
      });
    } catch (error) {
      return res.status(500).json({ error: "An error occurred during login" });
    }
});

authRouter.get("/get-user", async (req, res) => {
    const auth = await getAuthUserId(req);
    if (auth.error) {
      return res.status(auth.status).json({ error: auth.error });
    }

    try {
      const query = `
        SELECT * FROM users
        WHERE id = $1
      `;
      const values = [auth.userId];
      const { rows } = await connectionPool.query(query, values);

      if (!rows.length) {
        return res.status(404).json({ error: "User not found" });
      }

      const { data: supabaseUser } = await supabase.auth.getUser(
        req.headers.authorization?.split(" ")[1]
      );

      res.status(200).json({
        id: auth.userId,
        email: supabaseUser.user.email,
        username: rows[0].username,
        name: rows[0].name,
        role: rows[0].role,
        profilePic: rows[0].profile_pic,
      });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
});

authRouter.put("/profile", (req, res, next) => {
  profilePicUpload(req, res, (uploadError) => {
    if (uploadError) {
      return res.status(400).json({
        error: uploadError.message || "Invalid profile picture upload",
      });
    }
    next();
  });
}, async (req, res) => {
    const auth = await getAuthUserId(req);
    if (auth.error) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const file = req.file;

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    if (!username) {
      return res.status(400).json({ error: "Username is required" });
    }

    try {
      const usernameCheckQuery = `
        SELECT id FROM users
        WHERE username = $1 AND id <> $2
      `;
      const { rows: existingUser } = await connectionPool.query(
        usernameCheckQuery,
        [username, auth.userId]
      );

      if (existingUser.length > 0) {
        return res.status(400).json({ error: "This username is already taken" });
      }

      let profilePicUrl = null;

      if (file) {
        try {
          const filePath = getProfileImagePath(auth.userId, file.mimetype);
          profilePicUrl = await uploadImageToStorage({
            file,
            filePath,
            authHeader: req.headers.authorization,
          });
        } catch (uploadError) {
          console.error("Profile picture upload failed:", uploadError);
          return res.status(500).json({
            error: uploadError.message || "Failed to upload profile picture",
          });
        }
      }

      const query = `
        UPDATE users
        SET
          name = $1,
          username = $2,
          profile_pic = COALESCE($3, profile_pic)
        WHERE id = $4
        RETURNING *
      `;
      const values = [name, username, profilePicUrl, auth.userId];
      const { rows } = await connectionPool.query(query, values);

      if (!rows.length) {
        return res.status(404).json({ error: "User not found" });
      }

      const { data: supabaseUser, error: supabaseError } = await supabase.auth.getUser(
        req.headers.authorization?.split(" ")[1]
      );

      if (supabaseError || !supabaseUser?.user) {
        return res.status(401).json({ error: "Unauthorized or token expired" });
      }

      res.status(200).json({
        message: "Profile updated successfully",
        id: auth.userId,
        email: supabaseUser.user.email,
        username: rows[0].username,
        name: rows[0].name,
        role: rows[0].role,
        profilePic: rows[0].profile_pic,
      });
    } catch (error) {
      console.error("Failed to update profile:", error);
      res.status(500).json({
        error: "Failed to update profile",
        message: error.message,
      });
    }
});

authRouter.put("/reset-password", async (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];
    const { oldPassword, newPassword } = req.body;
    if (!token) {
      return res.status(401).json({ error: "Unauthorized: Token missing" });
    }
    if (!newPassword) {
      return res.status(400).json({ error: "New password is required" });
    }
    try {
      const { data: userData } = await supabase.auth.getUser(token);
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email: userData.user.email,
        password: oldPassword,
      });
      if (loginError) {
        return res.status(400).json({ error: "Invalid old password" });
      }
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) {
        return res.status(400).json({ error: error.message });
      }
      res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
      res.status(500).json({ error: "Internal server error" });
    }
});

export default authRouter