import express from "express";
import { getAuth } from "./auth";

const router = express.Router();


router.get("/protected", auth.requireAdmin, (req, res) => {
	const auth = getAuth();
  return auth.requireAdmin(req, res, next);
}, (req, res) => {
  res.json({ message: "Protected route" });
});

export default router;
