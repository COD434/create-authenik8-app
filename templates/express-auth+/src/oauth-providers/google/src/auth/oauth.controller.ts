import { Request, Response } from "express";
import { getAuth } from "./auth";

type OAuthProvider = "google";

function requireProvider(provider: OAuthProvider, res: Response) {
  const oauthProvider = getAuth().oauth?.[provider];

  if (!oauthProvider) {
    res.status(404).json({ error: `${provider} OAuth is not configured` });
    return undefined;
  }

  return oauthProvider;
}

export const oauthController = {
  googleRedirect(req: Request, res: Response) {
    requireProvider("google", res)?.redirect(req, res);
  },

  async googleCallback(req: Request, res: Response) {
    const provider = requireProvider("google", res);
    if (!provider) return;

    const result = await provider.handleCallback(req);

    res.json({
      provider: "google",
      ...result,
    });
  },

  googleLink(req: Request, res: Response) {
    requireProvider("google", res)?.redirect(req, res, "link");
  },
};
