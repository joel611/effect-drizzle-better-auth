export { account, session, user, verification } from "../auth/auth-schema";
export { task } from "../../demo-feature/schema.ts";

// Relations
import { taskRelations } from "../../demo-feature/schema.ts";
import { authRelations } from "../auth/auth-schema";

export const relations = { ...authRelations, ...taskRelations };
