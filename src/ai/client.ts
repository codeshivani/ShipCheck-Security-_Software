// Provider-agnostic LLM client. Keeps the rest of the app decoupled from
// whichever model provider is configured. The LLM is ONLY ever used for
// explanation/remediation/patch generation — never for vulnerability
// detection (see src/scanner for the deterministic detection engine).

export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LLMCompletionRequest {
  system: string;
  messages: LLMMessage[];
  maxTokens?: number;
}

export interface LLMProvider {
  complete(req: LLMCompletionRequest): Promise<string>;
}

class AnthropicProvider implements LLMProvider {
  constructor(private apiKey: string, private model = "claude-sonnet-4-6") {}

  async complete(req: LLMCompletionRequest): Promise<string> {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: req.maxTokens ?? 1200,
        system: req.system,
        messages: req.messages,
      }),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API error: ${res.status} ${await safeText(res)}`);
    }

    const data = await res.json();
    const textBlock = (data.content ?? []).find((b: { type: string; text?: string }) => b.type === "text");
    if (!textBlock?.text) throw new Error("Anthropic API returned no text content");
    return textBlock.text;
  }
}

class OpenAIProvider implements LLMProvider {
  constructor(private apiKey: string, private model = "gpt-4o-mini") {}

  async complete(req: LLMCompletionRequest): Promise<string> {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: req.maxTokens ?? 1200,
        messages: [{ role: "system", content: req.system }, ...req.messages],
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI API error: ${res.status} ${await safeText(res)}`);
    }

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("OpenAI API returned no content");
    return text;
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<no body>";
  }
}

let cachedProvider: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (cachedProvider) return cachedProvider;

  const providerName = process.env.AI_PROVIDER ?? "anthropic";

  if (providerName === "openai") {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("OPENAI_API_KEY is not configured");
    cachedProvider = new OpenAIProvider(key);
  } else {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error("ANTHROPIC_API_KEY is not configured");
    cachedProvider = new AnthropicProvider(key);
  }

  return cachedProvider;
}

export function isLLMConfigured(): boolean {
  const providerName = process.env.AI_PROVIDER ?? "anthropic";
  return providerName === "openai" ? !!process.env.OPENAI_API_KEY : !!process.env.ANTHROPIC_API_KEY;
}
