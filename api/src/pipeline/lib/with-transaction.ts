import type { SQL } from "bun";
import { type Db, fromBunSql } from "pg-boss";

export function withTransaction<T>(
  database: SQL,
  operation: (transaction: Db) => Promise<T>,
): Promise<T> {
  return database.begin(async function (transaction) {
    return operation(fromBunSql(transaction));
  });
}
