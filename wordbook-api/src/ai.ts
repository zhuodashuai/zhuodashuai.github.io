import type { AppConfig } from "./config";
import {
  AI_JSON_SCHEMA,
  AiOrganizedSchema,
  classifyInput,
  countEnglishTokens,
  makeEntryFromAi,
  safeHttpsUrl,
  validateEnglishInput,
  type AiOrganized,
  type PublicEntry,
  type SourceRecord
} from "./schema";
import { ApiError } from "./security";
import { estimateCorrectionConfidence, validateAndHarmonizeAiOutput } from "./semantic-quality";

const SYSTEM_PROMPT = `You are the server-side organizer for Zhuo's English wordbook. Return only data matching the supplied JSON schema.

Accuracy rules:
- Preserve the user's original input. suggestedTerm is only a spelling or standard-form suggestion; never silently replace it.
- Treat multiword expressions as a whole. "jab at" is a valid phrase; never reduce it to "jab".
- Give concise, idiomatic Simplified Chinese meanings and accurate English definitions. Separate genuinely different senses.
- For every word, phrase, phrasal verb, idiom or collocation, return at least one fully populated sense. Each sense must have its own part of speech, Chinese meaning, English definition and at least one natural bilingual example. Never merge different parts of speech into one sense.
- Order common contemporary meanings before rare, archaic, technical or botanical meanings. Never choose a rare sense merely because it appears first in a source.
- Make each example demonstrate only the sense it belongs to. Do not reuse the same example for multiple senses.
- Include register, collocations, confusing words and useful tags. Use slash- or bracket-delimited IPA when known; never copy ordinary spelling into the phonetic field and never fabricate IPA when uncertain.
- Support valid British and Australian spelling. A regional spelling may be noted as a variant, but must not be labelled as a misspelling or silently converted to US spelling.
- suggestedTerm is a corrected surface form only. For inflections, preserve the surface form in suggestedTerm and put the lemma in standardForm.
- For lexical entries, search in English and cross-check the common meanings and pronunciation against at least two independent authoritative English dictionaries when results are available. Prefer Cambridge, Oxford Learner's Dictionaries, Merriam-Webster and Collins. Do not claim that a source was checked unless it appears in the response citations.
- Distinguish word, phrase, phrasal-verb, idiom, collocation, sentence, quote and proverb.
- For quotes, proverbs and text that plausibly carries an attribution, use English-language web search and prioritize primary or authoritative sources.
- Do not invent author, work, date or source. Only include attribution fields when supported by web-search evidence in this response. If uncertain, leave them empty and say the source is unverified.
- Never treat the model's memory as source evidence. Wikiquote can only be a candidate, never verified.
- Do not include HTML.`;

function userPrompt(input: string, attempt: number): string {
  return `Organize this exact English input for the wordbook:\n${JSON.stringify(input)}\n${attempt ? "A previous response failed schema validation. Return a complete corrected object with every required field." : ""}`;
}

function extractOpenAiText(payload: Record<string, unknown>): string {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? (item as Record<string, unknown>).content as unknown[]
      : [];
    for (const part of content) {
      if (part && typeof part === "object" && typeof (part as Record<string, unknown>).text === "string") {
        return String((part as Record<string, unknown>).text);
      }
    }
  }
  return "";
}

function extractOpenAiSources(payload: Record<string, unknown>): SourceRecord[] {
  const results = new Map<string, SourceRecord>();
  const output = Array.isArray(payload.output) ? payload.output : [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as Record<string, unknown>).content)
      ? (item as Record<string, unknown>).content as unknown[]
      : [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const annotations = Array.isArray((part as Record<string, unknown>).annotations)
        ? (part as Record<string, unknown>).annotations as unknown[]
        : [];
      for (const annotation of annotations) {
        if (!annotation || typeof annotation !== "object") continue;
        const source = annotation as Record<string, unknown>;
        const rawUrl = typeof source.url === "string" ? source.url : "";
        if (!rawUrl) continue;
        try {
          const url = safeHttpsUrl(rawUrl);
          if (!results.has(url)) {
            results.set(url, {
              title: typeof source.title === "string" ? source.title.slice(0, 300) : new URL(url).hostname,
              url,
              kind: "candidate",
              retrievedAt: new Date().toISOString()
            });
          }
        } catch {
          // Invalid or private-network citations never enter a public entry.
        }
      }
    }
  }
  return [...results.values()].slice(0, 12);
}

async function openAiAttempt(input: string, config: AppConfig, attempt: number): Promise<{ organized: AiOrganized; sources: SourceRecord[] }> {
  if (!config.OPENAI_API_KEY) throw new ApiError(503, "ai_not_configured", "AI 尚未配置；草稿仍可手动填写并保存。");
  // Accuracy is the product priority: every organizer run may consult current
  // English-language sources, not only quotations and multiword inputs.
  const mayNeedAttributionSearch = classifyInput(input) === "quote" || countEnglishTokens(input) >= 1;
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.OPENAI_MODEL || "gpt-5.6-terra",
        instructions: SYSTEM_PROMPT,
        input: userPrompt(input, attempt),
        ...(mayNeedAttributionSearch ? { tools: [{ type: "web_search" }] } : {}),
        text: {
          format: {
            type: "json_schema",
            name: "zhuo_wordbook_entry",
            strict: true,
            schema: AI_JSON_SCHEMA
          }
        },
        max_output_tokens: 5000
      }),
      signal: AbortSignal.timeout(28_000)
    });
  } catch (error) {
    throw new ApiError(503, "ai_unreachable", "AI 暂时不可用；草稿已保留，可以手动填写。", String(error));
  }
  let payload: Record<string, unknown>;
  try { payload = await response.json() as Record<string, unknown>; } catch { payload = {}; }
  if (!response.ok) {
    const error = payload.error && typeof payload.error === "object" ? payload.error as Record<string, unknown> : {};
    const status = response.status === 429 ? 429 : 503;
    throw new ApiError(status, response.status === 429 ? "ai_rate_limited" : "ai_error", "AI 暂时没有完成整理；草稿已保留，可以手动填写。", error.code || error.message);
  }
  const text = extractOpenAiText(payload);
  let candidate: unknown;
  try { candidate = JSON.parse(text); } catch { throw new Error("OpenAI returned invalid JSON"); }
  return {
    organized: validateAndHarmonizeAiOutput(input, AiOrganizedSchema.parse(candidate)),
    sources: mayNeedAttributionSearch ? extractOpenAiSources(payload) : []
  };
}

function extractAnthropicText(payload: Record<string, unknown>): string {
  const content = Array.isArray(payload.content) ? payload.content : [];
  const text = content.find((item) => item && typeof item === "object" && (item as Record<string, unknown>).type === "text") as Record<string, unknown> | undefined;
  return typeof text?.text === "string" ? text.text : "";
}

async function anthropicAttempt(input: string, config: AppConfig, attempt: number): Promise<{ organized: AiOrganized; sources: SourceRecord[] }> {
  if (!config.ANTHROPIC_API_KEY || !config.ANTHROPIC_MODEL) {
    throw new ApiError(503, "ai_not_configured", "Claude provider 尚未配置；草稿仍可手动填写并保存。");
  }
  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": config.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.ANTHROPIC_MODEL,
        max_tokens: 5000,
        system: `${SYSTEM_PROMPT}\nJSON Schema:\n${JSON.stringify(AI_JSON_SCHEMA)}`,
        messages: [{ role: "user", content: userPrompt(input, attempt) }]
      }),
      signal: AbortSignal.timeout(28_000)
    });
  } catch (error) {
    throw new ApiError(503, "ai_unreachable", "Claude 暂时不可用；草稿已保留，可以手动填写。", String(error));
  }
  let payload: Record<string, unknown>;
  try { payload = await response.json() as Record<string, unknown>; } catch { payload = {}; }
  if (!response.ok) throw new ApiError(response.status === 429 ? 429 : 503, "ai_error", "Claude 暂时没有完成整理；草稿已保留，可以手动填写。");
  let candidate: unknown;
  try { candidate = JSON.parse(extractAnthropicText(payload)); } catch { throw new Error("Anthropic returned invalid JSON"); }
  return { organized: validateAndHarmonizeAiOutput(input, AiOrganizedSchema.parse(candidate)), sources: [] };
}

export async function organizeEntry(rawInput: unknown, config: AppConfig): Promise<{ entry: PublicEntry; provider: string; warnings: string[] }> {
  const input = validateEnglishInput(rawInput);
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = config.AI_PROVIDER === "anthropic"
        ? await anthropicAttempt(input, config, attempt)
        : await openAiAttempt(input, config, attempt);
      const confidence = estimateCorrectionConfidence(input, result.organized.suggestedTerm);
      const entry = makeEntryFromAi(input, result.organized, config.AI_PROVIDER, result.sources, confidence);
      const warnings: string[] = [];
      if (["quote", "proverb"].includes(entry.entryType) && entry.attributionStatus !== "candidate") {
        warnings.push("未找到可核验出处；作者和出处保持空白，状态为未核验。");
      }
      if (entry.correction.status === "suggested") warnings.push("拼写只作为建议，发布前请选择采用、保留原文或手动修改。");
      return { entry, provider: config.AI_PROVIDER, warnings };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      lastError = error;
    }
  }
  throw new ApiError(502, "ai_invalid_output", "AI 连续返回了不合格格式；草稿已保留，请手动填写。", String(lastError));
}
