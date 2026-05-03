import { Request, Response } from "express";
import { getAuth } from "./auth";

export const oauthController = {
  googleRedirect(req: Request, res: Response) {
    getAuth().oauth?.google?.redirect(req, res);
  },

  async googleCallback(req: Request, res: Response) {
    const result = await getAuth().oauth?.google?.handleCallback(req);

    res.json({
      provider: "google",
      ...result,
    });
  },

  githubRedirect(req: Request, res: Response) {
    getAuth().oauth?.github?.redirect(req, res);
  },

  async githubCallback(req: Request, res: Response) {
    const result = await getAuth().oauth?.github?.handleCallback(req);

    res.json({
      provider: "github",
      ...result,
    });
  },

  googleLink(req: Request, res: Response) {
    getAuth().oauth?.google?.redirect(req, res, "link");
  },

  githubLink(req: Request, res: Response) {
    getAuth().oauth?.github?.redirect(req, res, "link");
  },
};
