"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Incognito = void 0;
const verifyToken = (token) => ({
    id: "guest",
    type: token === "temp-token" ? "guest-mode" : "authenticated"
});
const guestToken = () => "temp-token";
const Incognito = (req, res, next) => {
    const authHeader = req.headers.authorization;
    let token = authHeader === null || authHeader === void 0 ? void 0 : authHeader.split(" ")[1];
    let user = token ? verifyToken(token) : null;
    if (!user) {
        const GToken = guestToken();
        user = verifyToken(GToken);
        res.setHeader("X-Guest-Token", GToken);
    }
    if ((user === null || user === void 0 ? void 0 : user.type) === "guest-mode") {
    }
    res.user = user;
    next();
};
exports.Incognito = Incognito;
//# sourceMappingURL=guestModeService.js.map