import { UserStore } from "../types/storage";
export declare class Store {
    private userStore;
    constructor(userStore: UserStore);
    register(email: string, password: string): Promise<void>;
}
//# sourceMappingURL=userStorage.d.ts.map