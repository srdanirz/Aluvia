import "server-only";

import { z } from "zod";

// Server configuration, validated once at import. A missing or malformed value fails at
// startup with the variable's name, never mid-request.
const schema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(5),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment:\n${issues}\nSee .env.example.`);
}

export const env = parsed.data;
