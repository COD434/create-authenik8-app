import express from "express";
import { getAuth } from "./auth";


const router = express.Router();


router.get("/protected", (req, res, next) => {

	const auth = getAuth()

   auth.requireAdmin(req, res, next);
}, (req, res) => {
  res.json({ message: "Protected route" });
});

export default router;
