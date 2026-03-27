const GAMMA_API_BASE = "https://public-api.gamma.app/v1.0";

interface CreateDeckOptions {
  inputText: string;
  numCards?: number;
  themeId?: string;
  exportAs?: "pdf" | "pptx";
  cardOptions?: {
    headerFooter?: Record<string, unknown>;
  };
}

interface CreateDeckResult {
  generationId: string;
  warnings?: string;
}

interface PollResult {
  generationId: string;
  status: "pending" | "completed" | "failed";
  gammaUrl?: string;
  gammaId?: string;
  exportUrl?: string;
  error?: { message: string };
}

interface PollOptions {
  intervalMs?: number;
  maxAttempts?: number;
}

export async function createGammaDeck(
  options: CreateDeckOptions
): Promise<CreateDeckResult> {
  const apiKey = process.env.GAMMA_API_KEY;
  if (!apiKey) throw new Error("GAMMA_API_KEY is not set");

  const body = {
    inputText: options.inputText,
    format: "presentation" as const,
    textMode: "preserve" as const,
    ...(options.numCards && { numCards: options.numCards }),
    ...(options.themeId && { themeId: options.themeId }),
    ...(options.exportAs && { exportAs: options.exportAs }),
    imageOptions: { source: "noImages" as const },
    cardOptions: {
      dimensions: "16x9" as const,
      ...options.cardOptions,
    },
  };

  const res = await fetch(`${GAMMA_API_BASE}/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      `Gamma API error (${res.status}): ${err.error || "Unknown error"}`
    );
  }

  return res.json();
}

export async function pollGammaGeneration(
  generationId: string,
  options: PollOptions = {}
): Promise<PollResult> {
  const { intervalMs = 5000, maxAttempts = 60 } = options;
  const apiKey = process.env.GAMMA_API_KEY;
  if (!apiKey) throw new Error("GAMMA_API_KEY is not set");

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(`${GAMMA_API_BASE}/generations/${generationId}`, {
      headers: { "X-API-KEY": apiKey },
    });

    if (!res.ok) {
      throw new Error(`Gamma poll error (${res.status})`);
    }

    const result: PollResult = await res.json();

    if (result.status === "completed") return result;
    if (result.status === "failed") {
      throw new Error(
        `Gamma generation failed: ${result.error?.message || "Unknown"}`
      );
    }

    if (attempt < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  throw new Error("Gamma generation timed out");
}
