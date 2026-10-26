export interface EverydayLookupEntry {
  readonly term: string;
  readonly partOfSpeech: string;
  readonly meaning: string;
  readonly chineseAliases: readonly string[];
  readonly englishForms: readonly string[];
  readonly en: string;
  readonly zh: string;
  readonly references: readonly string[];
}

export const EVERYDAY_LOOKUP_ENTRIES: readonly EverydayLookupEntry[];
