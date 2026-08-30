/**
 * PC#8 — Substrate-Crossing Seam — Item 3.1 (Run 6)
 * Deterministic assembly of a crossing's content object from granted input
 * documents, and the per-input lineage the intent record carries.
 *
 * Governing docs:
 *   pc08-phase3-item-3-1-build-brief-v0-1-2_2026-08-29.md (§3 steps 2–3)
 *   D-1 r2 (grant boundary = publish boundary; seam assembles from granted
 *     documents); D-3 (aggregate digest; deterministic assembly; input
 *     digests are lineage, not binding); D-5 (assembly document; lineage
 *     list; createdAt = max across inputs, never the assembly clock)
 *   substrate-crossing/docs/CONVENTIONS.md (§Records assembly rule — normative
 *     from v0.2; operator ruling S4, 2026-08-29)
 *
 * Assembly rule (normative, CONVENTIONS v0.2 §Records):
 *   title     = first input's title
 *   content   = input contents joined with "\n\n" in fixed input order
 *   createdAt = the maximum createdAt across inputs in fixed order, or null
 *               if no input carries one; never the assembly clock
 *   The resulting object is normalized through canonicalJson() before it is
 *   digested (D-3); the binding digest is digest.ts#authorizedContentDigest
 *   over that object. No third digest implementation is introduced here.
 */
import { canonicalJson } from './canonical-json.js';
import { authorizedContentDigest, type CrossingSourceContent } from './digest.js';

/** The content object the seam writes to the assembly document. `createdAt`
 *  is null when no input carries one (D-5). */
export interface AssembledContent {
  title: string;
  content: string;
  createdAt: string | null;
}

/** One granted input, as the seam sees it after the per-document gate. */
export interface AssemblyInput {
  documentURI: string;
  /** Input document heads at read (comma-joined), or 'heads-unavailable'. */
  documentCID: string;
  content: CrossingSourceContent;
}

/** One entry of the intent record's `sourceLineage` (D-5). */
export interface SourceLineageEntry {
  documentURI: string;
  documentCID: string;
  /** digest.ts#authorizedContentDigest over this input's content object —
   *  informational lineage, not the binding digest (D-3). */
  contentDigest: string;
}

const SEPARATOR = '\n\n';

function maxCreatedAt(inputs: CrossingSourceContent[]): string | null {
  let best: string | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const i of inputs) {
    if (typeof i.createdAt !== 'string' || i.createdAt === '') continue;
    const ms = Date.parse(i.createdAt);
    if (Number.isNaN(ms)) continue;
    // Strict > keeps the earlier input on a tie (fixed-order determinism).
    if (ms > bestMs) {
      bestMs = ms;
      best = i.createdAt;
    }
  }
  return best;
}

/** Assembles the crossing content object from granted inputs in fixed
 *  order. Pure: same inputs → same object, byte for byte after
 *  canonicalJson(). Throws on an empty input list — the uniform path
 *  requires at least one granted input (D-5 / brief §3). */
export function assembleCrossingContent(
  inputs: CrossingSourceContent[],
): AssembledContent {
  if (inputs.length === 0) {
    throw new Error('assembly requires at least one granted input document');
  }
  const assembled: AssembledContent = {
    title: inputs[0].title,
    content: inputs.map((i) => i.content).join(SEPARATOR),
    createdAt: maxCreatedAt(inputs),
  };
  // D-3: canonical serialization governs the object before digesting.
  return JSON.parse(canonicalJson(assembled)) as AssembledContent;
}

/** The binding digest over an assembled (or any) content object —
 *  digest.ts#authorizedContentDigest, with null createdAt mapped to the
 *  documented absent-as-null serialization. */
export function assembledContentDigest(c: CrossingSourceContent): string {
  return authorizedContentDigest({ title: c.title, content: c.content, createdAt: c.createdAt ?? null });
}

/** Lineage list in fixed aggregation order — one entry per granted input. */
export function buildSourceLineage(inputs: AssemblyInput[]): SourceLineageEntry[] {
  return inputs.map((i) => ({
    documentURI: i.documentURI,
    documentCID: i.documentCID,
    contentDigest: assembledContentDigest(i.content),
  }));
}

const HEX64 = /^[0-9a-f]{64}$/;

/** Shape/presence validation of a `sourceLineage` value. Empty is rejected
 *  unconditionally (uniform path — every crossing has ≥1 input). */
export function validateSourceLineage(value: unknown): string[] {
  const errors: string[] = [];
  if (!Array.isArray(value)) {
    errors.push('sourceLineage must be an array');
    return errors;
  }
  if (value.length === 0) {
    errors.push('sourceLineage must not be empty (uniform assembly path)');
    return errors;
  }
  value.forEach((e, idx) => {
    if (e === null || typeof e !== 'object') {
      errors.push(`sourceLineage[${idx}] is not an object`);
      return;
    }
    const entry = e as Partial<SourceLineageEntry>;
    for (const f of ['documentURI', 'documentCID', 'contentDigest'] as const) {
      const v = entry[f];
      if (typeof v !== 'string' || v === '') {
        errors.push(`sourceLineage[${idx}].${f} missing or empty`);
      }
    }
    if (typeof entry.contentDigest === 'string' && entry.contentDigest !== '' && !HEX64.test(entry.contentDigest)) {
      errors.push(`sourceLineage[${idx}].contentDigest must be 64 hex chars (sha256)`);
    }
  });
  return errors;
}
