import type { ZodType } from "zod";

import {
  AnalyticsRequest,
  AnalyticsResponse,
  type AnalyticsEvent,
  type AnalyticsResponse as AnalyticsResponseData,
  EnrichmentRequest,
  EnrichmentResponse,
  type EnrichmentRequest as EnrichmentRequestData,
  type EnrichmentResponse as EnrichmentResponseData,
} from "./contracts.ts";

export interface HeyeringClient {
  enrich(
    request: EnrichmentRequestData,
    options?: HeyeringRequestOptions,
  ): Promise<EnrichmentResponseData>;
  sendAnalytics(
    events: readonly AnalyticsEvent[],
    options?: HeyeringRequestOptions,
  ): Promise<AnalyticsResponseData>;
}

export interface HeyeringClientConfig {
  apiToken: string;
  baseUrl: string | URL;
  fetch?: typeof globalThis.fetch;
}

export interface HeyeringRequestOptions {
  signal?: AbortSignal;
}

export class HeyeringClientError extends Error {
  readonly retryable: boolean;

  constructor(
    message: string,
    options: {
      retryable: boolean;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "HeyeringClientError";
    this.retryable = options.retryable;
  }
}

export function createHeyeringClient(
  config: HeyeringClientConfig,
): HeyeringClient {
  const apiToken = config.apiToken.trim();

  if (!apiToken) {
    throw new TypeError("Heyering API token cannot be empty");
  }

  const baseUrl = new URL(config.baseUrl);
  const fetchRequest = config.fetch ?? globalThis.fetch;

  return {
    enrich(request, options) {
      return postJson(
        fetchRequest,
        baseUrl,
        apiToken,
        "enrichment",
        request,
        EnrichmentRequest,
        EnrichmentResponse,
        options?.signal,
      );
    },
    sendAnalytics(events, options) {
      return postJson(
        fetchRequest,
        baseUrl,
        apiToken,
        "analytics",
        events,
        AnalyticsRequest,
        AnalyticsResponse,
        options?.signal,
      );
    },
  };
}

type HeyeringEndpoint = "analytics" | "enrichment";

async function postJson<RequestBody, ResponseBody>(
  fetchRequest: typeof globalThis.fetch,
  baseUrl: URL,
  apiToken: string,
  endpoint: HeyeringEndpoint,
  input: unknown,
  requestSchema: ZodType<RequestBody>,
  responseSchema: ZodType<ResponseBody>,
  signal?: AbortSignal,
) {
  const requestBody = parseContract(requestSchema, input, endpoint, "request");

  let response: Response;

  try {
    response = await fetchRequest(new URL(`/${endpoint}`, baseUrl), {
      method: "POST",
      headers: {
        Authorization: apiToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: signal ?? null,
    });
  } catch (error: unknown) {
    if (signal?.aborted) {
      throw error;
    }

    throw new HeyeringClientError(
      `Heyering ${endpoint} request could not be completed`,
      {
        retryable: true,
        cause: error,
      },
    );
  }

  if (!response.ok) {
    await response.body?.cancel();

    throw new HeyeringClientError(
      `Heyering ${endpoint} request failed with status ${response.status}`,
      {
        retryable: response.status === 429 || response.status >= 500,
      },
    );
  }

  let responseBody: unknown;

  try {
    responseBody = await response.json();
  } catch (error: unknown) {
    throw new HeyeringClientError(
      `Heyering ${endpoint} response is not valid JSON`,
      {
        retryable: false,
        cause: error,
      },
    );
  }

  return parseContract(responseSchema, responseBody, endpoint, "response");
}

function parseContract<Output>(
  schema: ZodType<Output>,
  value: unknown,
  endpoint: HeyeringEndpoint,
  direction: "request" | "response",
) {
  const result = schema.safeParse(value);

  if (!result.success) {
    throw new HeyeringClientError(
      `Heyering ${endpoint} ${direction} does not match its contract`,
      {
        retryable: false,
        cause: result.error,
      },
    );
  }

  return result.data;
}
