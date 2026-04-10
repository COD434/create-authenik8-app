import express from "express";
import { getAuth } from "./auth";

const router = express.Router();
const auth = getAuth();

router.get("/protected", auth.requireAdmin, (req, res) => {
  res.json({ message: "Protected route" });
});

export default router;
