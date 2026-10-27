export interface EverydayLookupEntry {
  readonly term: string;
  readonly partOfSpeech: string;
  readonly meaning: string;
  readonly chineseAliases: readonly string[];
  readonly englishForms: readonly string[];
  readonly en: string;
  readonly zh: string;
  readonly references: readonly string[];
  readonly dictionarySource?: string;
  readonly exampleSource?: string;
  readonly exampleReviewer?: string;
  readonly reviewedCanonicalSense?: boolean;
  readonly retainLegacyChinese?: boolean;
  readonly canonicalId?: number;
  readonly canonicalSourceSha256?: string;
  readonly retainedCanonicalAlternatives?: readonly {
    readonly partOfSpeech: string;
    readonly meaning: string;
    readonly source: string;
    readonly license: string;
    readonly url: string;
    readonly usageNote?: string;
  }[];
}

export const EVERYDAY_LOOKUP_ENTRIES: readonly EverydayLookupEntry[];
export const EVERYDAY_CHINESE_ALIASES: readonly {
  readonly term: string;
  readonly aliases: readonly string[];
  readonly targetEntrySha256: string;
}[];
