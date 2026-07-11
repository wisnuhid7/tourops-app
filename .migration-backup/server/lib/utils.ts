import { randomBytes } from "crypto";

export function generateCode(len: number = 6): string {
  return randomBytes(Math.ceil(len / 2)).toString("hex").toUpperCase().slice(0, len);
}
