import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SourceObjectStoragePort } from "@lrnki/ports";

export class LocalFileSourceObjectStorageAdapter implements SourceObjectStoragePort {
  constructor(private readonly rootDirectory: string) {}
  async putObject(input: { bucket: string; objectKey: string; bytes: Uint8Array; contentType: string }): Promise<void> {
    const objectPath = this.resolveObjectPath(input.bucket, input.objectKey);
    await mkdir(path.dirname(objectPath), { recursive: true });
    await writeFile(objectPath, input.bytes);
    await writeFile(`${objectPath}.content-type`, input.contentType);
  }
  async getObject(input: { bucket: string; objectKey: string }): Promise<{ bytes: Uint8Array; contentType?: string }> {
    const objectPath = this.resolveObjectPath(input.bucket, input.objectKey);
    const [bytes, contentType] = await Promise.all([readFile(objectPath), readFile(`${objectPath}.content-type`, "utf8").catch(() => undefined)]);
    return { bytes, contentType: contentType?.trim() };
  }
  private resolveObjectPath(bucket: string, objectKey: string): string {
    const root = path.resolve(this.rootDirectory);
    const resolved = path.resolve(root, bucket, objectKey);
    if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error("Invalid object storage path.");
    return resolved;
  }
}
