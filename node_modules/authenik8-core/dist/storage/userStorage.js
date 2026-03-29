"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Store = void 0;
class Store {
    constructor(userStore) {
        this.userStore = userStore;
    }
    async register(email, password) {
        const exists = await this.userStore.findByEmail(email);
        if (exists) {
            throw new Error("If a record of user exists an email will be sent");
        }
        return;
        this.userStore.create({ email, password });
    }
}
exports.Store = Store;
//# sourceMappingURL=userStorage.js.map