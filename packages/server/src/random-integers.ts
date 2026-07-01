import type { Request, Response } from "express";

const RANDOM_ORG_URL = "https://api.random.org/json-rpc/4/invoke";

type RandomOrgSuccess = {
  result: {
    random: { data: number[] };
  };
};

type RandomOrgError = {
  error: { code: number; message: string };
};

function parseParams(req: Request): { n: number; min: number; max: number } | null {
  const raw = req.method === "GET" ? req.query : req.body;
  const n = Number(raw?.n);
  const min = Number(raw?.min);
  const max = Number(raw?.max);
  if (
    !Number.isInteger(n) || n < 1 || n > 10_000 ||
    !Number.isInteger(min) || min < -1e9 || min > 1e9 ||
    !Number.isInteger(max) || max < -1e9 || max > 1e9 ||
    min > max
  ) {
    return null;
  }
  return { n, min, max };
}

export async function randomIntegersHandler(req: Request, res: Response): Promise<void> {
  const params = parseParams(req);
  if (!params) {
    res.status(400).json({
      error: "n, min, and max are required integers (n: 1–10000, min/max: ±1e9, min ≤ max)",
    });
    return;
  }

  const apiKey = process.env.RANDOM_ORG_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "RANDOM_ORG_API_KEY not configured" });
    return;
  }

  let upstream: globalThis.Response;
  try {
    upstream = await fetch(RANDOM_ORG_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "generateIntegers",
        params: { apiKey, ...params },
        id: 1,
      }),
    });
  } catch {
    res.status(502).json({ error: "Failed to reach random.org" });
    return;
  }

  const data = (await upstream.json()) as RandomOrgSuccess | RandomOrgError;
  if ("error" in data) {
    res.status(502).json({ error: data.error.message });
    return;
  }

  res.json({ data: data.result.random.data });
}
