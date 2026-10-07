import { taskRelations } from "../../demo-feature/schema.ts";
import { authRelations } from "../auth/auth-schema";
import { mergeRelations } from "./merge-relations.ts";

export { account, user } from "../auth/auth-schema";
export { task } from "../../demo-feature/schema.ts";

export const relations = mergeRelations(authRelations, taskRelations);
