const BASE_URL = "https://api.hubapi.com";

export class HubSpotClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
    };
  }

  async get(path: string, params?: Record<string, string>): Promise<unknown> {
    let url = `${BASE_URL}${path}`;
    if (params) {
      const qs = new URLSearchParams(params).toString();
      url += `?${qs}`;
    }
    return this.request(url, { method: "GET", headers: this.headers });
  }

  async post(path: string, body?: unknown): Promise<unknown> {
    return this.request(`${BASE_URL}${path}`, {
      method: "POST",
      headers: this.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async patch(path: string, body: unknown): Promise<unknown> {
    return this.request(`${BASE_URL}${path}`, {
      method: "PATCH",
      headers: this.headers,
      body: JSON.stringify(body),
    });
  }

  async put(path: string, body?: unknown): Promise<unknown> {
    return this.request(`${BASE_URL}${path}`, {
      method: "PUT",
      headers: this.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  private async request(url: string, init: RequestInit): Promise<unknown> {
    const res = await fetch(url, init);
    if (!res.ok) {
      let message = `status ${res.status}`;
      try {
        const err = (await res.json()) as { message?: string };
        if (err.message) message = err.message;
      } catch {
        // ignore JSON parse errors
      }
      throw new Error(`HubSpot API error ${res.status}: ${message}`);
    }
    return res.json();
  }
}
