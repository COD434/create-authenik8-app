declare global {
  namespace Express {
    interface Request {
      id: string;
      user?: {
        userId: string;
        sessionId?: string;
        email: string;
        name: string;
        role: "USER" | "ADMIN";
      };
    }
  }
}

export {};
