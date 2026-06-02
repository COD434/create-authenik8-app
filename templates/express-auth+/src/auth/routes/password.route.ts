import express from "express";
import { passwordController } from "../controllers/password.controller";

const router = express.Router();

router.post("/register", passwordController.register);
router.post("/login", passwordController.login);

export default router;
