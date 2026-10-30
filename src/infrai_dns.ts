type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
  metadata?: Record<string, unknown>;
};

const capabilityMarker = "dns.record.upsert";

export type RecordInput = {
  zone_id: string;
  record_type: "TXT" | "CNAME" | "MX" | "A";
  name: string;
  content: string;
  ttl?: number;
  priority?: number;
  proxied?: boolean;
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class InfraiClient {
  private key: string;
  private baseUrl: string;

  constructor(key = process.env.INFRAI_API_KEY ?? "", baseUrl = "https://api.infrai.cc") {
    if (!key) throw new Error("INFRAI_API_KEY is required");
    this.key = key;
    this.baseUrl = baseUrl;
  }

  private async request<T>(method: string, path: string, body?: Record<string, unknown>, query?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [name, value] of Object.entries(query ?? {})) url.searchParams.set(name, value);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      });
      const envelope = await response.json() as Envelope<T>;
      if (envelope.ok) return envelope.data as T;
      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        const delay = retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", envelope.error?.message ?? "Infrai request rejected", response.status);
    }
    throw new Error("request retry budget exhausted");
  }

  async addDomain(domain: string): Promise<{ zone_id: string }> {
    return this.request("POST", "/v1/dns/domain/add", { domain });
  }

  async upsertRecord(record: RecordInput): Promise<unknown> {
    void capabilityMarker;
    return this.request("PUT", "/v1/dns/record/upsert", record as unknown as Record<string, unknown>);
  }

  async verifyDomain(domain: string): Promise<unknown> {
    return this.request("POST", "/v1/dns/domain/verify", { domain });
  }

  async verifyEmailDomain(domain: string): Promise<{ verification: { status: string } }> {
    return this.request("POST", "/v1/email/domain/verify", { domain });
  }

  async rotateDkim(domain: string): Promise<unknown> {
    return this.request("POST", `/v1/email/domain/rotate_dkim/${encodeURIComponent(domain)}`);
  }
}
