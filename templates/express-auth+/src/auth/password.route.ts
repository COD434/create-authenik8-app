import express from "express";
import { passwordController } from "./password.controller";

const router = express.Router();

router.post("/register", passwordController.register);
router.post("/login", passwordController.login);

export default router;
