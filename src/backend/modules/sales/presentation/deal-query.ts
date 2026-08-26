import { SalesError } from "../contracts/deal.contract";

export function parseStageCursors(params: URLSearchParams) {
  const result: Record<string, string> = {};
  for (const encoded of params.getAll("stageCursor")) {
    const separator = encoded.indexOf(".");
    if (separator <= 0 || separator === encoded.length - 1)
      throw new SalesError("validation_failed", 400);
    const stageId = encoded.slice(0, separator);
    if (stageId in result) throw new SalesError("validation_failed", 400);
    result[stageId] = encoded.slice(separator + 1);
  }
  return result;
}
