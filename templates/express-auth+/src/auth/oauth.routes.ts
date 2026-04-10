import express from "express";
import { auth } from "./auth";

const router = express.Router();

// GOOGLE
router.get("/google", (req, res) => {
  auth.oauth?.google?.redirect(req, res);
});

router.get("/google/callback", async (req, res) => {
  const result = await auth.oauth?.google?.handleCallback(req);

  res.json({
    provider: "google",
    ...result,
  });
});

// GITHUB
router.get("/github", (req, res) => {
  auth.oauth?.github?.redirect(req, res);
});

router.get("/github/callback", async (req, res) => {
  const result = await auth.oauth?.github?.handleCallback(req);

  res.json({
    provider: "github",
    ...result,
  });
});


router.get("/google/link", (req, res) => {
  auth.oauth?.google?.redirect(req, res, "link");
});

router.get("/github/link", (req, res) => {
  auth.oauth?.github?.redirect(req, res, "link");
});

export default router;
