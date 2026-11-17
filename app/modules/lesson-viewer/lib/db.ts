import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type * as schema from "~/db/schema";

/** The database a lib function reads and writes; the entry points pass it in. */
export type Db = BetterSQLite3Database<typeof schema>;
