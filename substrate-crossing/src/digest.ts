import { createHash } from 'node:crypto';

/**
 * Content fields of the local-first source document that are bound at grant
 * time (PC#8 v0.1.3, CP-F11). Field set matches the com.whtwnd.blog.entry
 * crossing target: title, content (Markdown), optional createdAt.
 */
export interface CrossingSourceContent {
  title: string;
  content: string;
  createdAt?: string; // ISO timestamp
}

/**
 * authorizedContentDigest — SHA-256 over a canonical serialization of the
 * content fields at grant time.
 *
 * Canonicalization: fixed field order (title, content, createdAt), JSON
 * serialization with no whitespace. Absent createdAt serializes as null so
 * the digest is stable across "field absent" vs "field undefined".
 *
 * This is the content-binding field required by PC#8 v0.1.3 (CP-F11): the
 * grant authorizes THIS content snapshot, and the intent record carries the
 * digest so deferred parties can check what was authorized against what
 * crossed.
 */
export function authorizedContentDigest(c: CrossingSourceContent): string {
  const canonical = JSON.stringify([c.title, c.content, c.createdAt ?? null]);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
