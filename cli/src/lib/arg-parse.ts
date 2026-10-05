import { parseArgs, type ParseArgsConfig } from "node:util";

export class UsageError extends Error {}

export function argParse<const Config extends ParseArgsConfig>(config: Config) {
  try {
    return parseArgs(config);
  } catch (error: unknown) {
    if (!(error instanceof TypeError)) {
      throw error;
    }

    throw new UsageError(error.message, { cause: error });
  }
}
