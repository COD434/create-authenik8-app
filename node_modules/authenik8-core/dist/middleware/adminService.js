"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdmin = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const requireAdmin = (options) => {
    const { jwtSecret, redis } = options;
    return (req, res, next) => {
        var _a;
        const authHeader = req.headers.authorization;
        const cookieToken = (_a = req.cookies) === null || _a === void 0 ? void 0 : _a.token;
        let token;
        if (authHeader && authHeader.startsWith("Bearer")) {
            token = authHeader.split(" ")[1];
        }
        if (!token && cookieToken) {
            token = cookieToken;
        }
        if (!token) {
            return res.status(401).json({ error: "Unauthorized:No token provided" });
        }
        try {
            const decoded = jsonwebtoken_1.default.verify(token, options.jwtSecret);
            if (typeof decoded.role !== "string") {
                res.status(403).json({ error: "Forbidden: Admin only" });
            }
            const payload = decoded;
            req.user = decoded;
            next();
        }
        catch (error) {
            return;
            res.status(401).json({ error: "Invalid or expired token" });
        }
    };
};
exports.requireAdmin = requireAdmin;
//# sourceMappingURL=adminService.js.map