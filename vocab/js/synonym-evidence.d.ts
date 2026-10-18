export const SYNONYM_FEATURE_ENABLED: boolean;
export function isSynonymLexicalEntry(entry: any): boolean;
export function entrySynonymFingerprint(entry: any): string;
export function candidateSynonymFingerprint(entries: any[], options?: { fingerprints?: ReadonlyMap<string, string> }): string;
export interface SynonymFingerprintIndex {
  contentKey: string;
  fingerprints: Map<string, string>;
  candidates: Map<string, string>;
  candidateFingerprint(entryId: string): string;
}
export function indexSynonymFingerprints(entries: any[], previous?: SynonymFingerprintIndex | null): SynonymFingerprintIndex;
export function pendingSynonymScan(entry: any, candidates?: any[], checkedAt?: string, reason?: string): {
  version: 1; status: "pending"; sourceFingerprint: string; candidatesFingerprint: string;
  checkedAt: string; candidateCount: number; matches: never[]; reason: string;
};
