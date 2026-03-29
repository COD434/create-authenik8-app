"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTestApp = void 0;
// tests/testApp.ts
const express_1 = __importDefault(require("express"));
const supertest_1 = __importDefault(require("supertest"));
const createAuthenik8_1 = require("../createAuthenik8");
const createTestApp = async () => {
    const auth = await (0, createAuthenik8_1.createAuthenik8)({
        jwtSecret: "test-secret",
        refreshSecret: "refresh-secret",
        jwtExpiry: "15m"
    });
    const app = (0, express_1.default)();
    app.use(express_1.default.json());
    // 🔐 Login (simulate user)
    app.post("/login", async (req, res) => {
        const user = { userId: "user_1", email: "test@test.com" };
        const accessToken = auth.signToken(user);
        const refreshToken = await auth.generateRefreshToken(user);
        res.json({ accessToken, refreshToken });
        console.log("Refresh Token", refreshToken);
    });
    // 🔒 Protected route
    app.get("/protected", (req, res) => {
        var _a;
        const token = (_a = req.headers.authorization) === null || _a === void 0 ? void 0 : _a.split(" ")[1];
        if (!token) {
            return res.status(401).json({ error: "Invalid token" });
        }
        const decoded = auth.verifyToken(token);
        if (!decoded) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        res.json({ data: "secure data", user: decoded });
    });
    // 🔄 Refresh
    app.post("/refresh", async (req, res) => {
        try {
            const result = await auth.refreshToken(req.body.refreshToken);
            res.json(result);
        }
        catch (err) {
            res.status(401).json({ error: "Invalid refresh token" });
        }
    });
    return { app, auth, request: (0, supertest_1.default)(app) };
};
exports.createTestApp = createTestApp;
//# sourceMappingURL=testApp.js.map