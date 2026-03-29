import request from "supertest";
export declare const createTestApp: () => Promise<{
    app: import("express-serve-static-core").Express;
    auth: import("../types/public").Authenik8Instance;
    request: import("supertest/lib/agent")<request.SuperTestStatic.Test>;
}>;
//# sourceMappingURL=testApp.d.ts.map