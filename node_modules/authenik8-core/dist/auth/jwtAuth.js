"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JWTService = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
class JWTService {
    signToken(payload) {
        return jsonwebtoken_1.default.sign(payload, this.jwtSecret, {
            expiresIn: this.expiry || "1h"
        });
    }
    ;
    constructor(options) {
        this.authenticateJWT = async (req, res, next) => {
            var _a;
            const authHeader = req.headers.authorization;
            const token = ((_a = req.cookies) === null || _a === void 0 ? void 0 : _a.token) || ((authHeader === null || authHeader === void 0 ? void 0 : authHeader.startsWith("Bearer ")) ? authHeader.split(" ")[1] : null);
            if (!token) {
                return res.status(401).json({ message: "Unauthorized" });
            }
            try {
                const decoded = jsonwebtoken_1.default.verify(token, this.jwtSecret);
                if (this.redisclient && decoded.userId) {
                    const storedToken = await this.redisclient.get(`session:${decoded.userId}`);
                    if (storedToken !== token) {
                        return res
                            .status(403)
                            .json({ success: false, message: "invalid session", errors: [] });
                    }
                }
                req.user = decoded;
                next();
            }
            catch {
                return res.status(403)
                    .json({ success: false, message: "invalid or expired token" });
            }
        };
        this.jwtSecret = options.jwtSecret;
        this.expiry = options.expiry;
        this.redisclient = options.redisClient;
        this.onGuestToken = options.onGuestToken;
    }
    guestToken() {
        const payload = {
            type: "guest",
            id: crypto_1.default.randomUUID(),
            createdAt: Date.now()
        };
        if (this.onGuestToken)
            this.onGuestToken();
        return jsonwebtoken_1.default.sign(payload, this.jwtSecret, { expiresIn: this.expiry });
    }
    verifyToken(token) {
        try {
            return jsonwebtoken_1.default.verify(token, this.jwtSecret);
        }
        catch {
            return null;
        }
    }
}
exports.JWTService = JWTService;
//# sourceMappingURL=jwtAuth.js.map