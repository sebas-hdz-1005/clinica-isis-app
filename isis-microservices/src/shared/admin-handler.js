import { requireAdmin } from "./auth-context.js";
import { handle } from "./handler.js";

export const handleAdmin = (fn) =>
  handle(async (event, context) => {
    const admin = requireAdmin(event);
    return fn(event, context, admin);
  });
