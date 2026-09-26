export function isSynonymLexicalEntry(entry: any): boolean;
export function entrySynonymFingerprint(entry: any): string;
export function candidateSynonymFingerprint(entries: any[]): string;
export function pendingSynonymScan(entry: any, candidates?: any[], checkedAt?: string, reason?: string): {
  version: 1; status: "pending"; sourceFingerprint: string; candidatesFingerprint: string;
  checkedAt: string; candidateCount: number; matches: never[]; reason: string;
};
