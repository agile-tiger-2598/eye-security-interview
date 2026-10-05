import { setTimeout as delay } from "node:timers/promises";

import {
  UploadResponse,
  UploadStatusResponse,
} from "@eye-security-interview/contracts";
import { describe, expect, it } from "bun:test";

import { AnalyticsRequest } from "../src/lib/heyering/contracts.ts";
import {
  HEYERING_API_TOKEN,
  type IntegrationTestSystem,
  setupIntegrationTestSystem,
} from "./setup.ts";

describe("API integration", function () {
  const getTestSystem = setupIntegrationTestSystem();

  it("processes an import through enrichment and analytics", async function () {
    const system = getTestSystem();
    const jobId = await submitImport(
      system.apiUrl,
      `id;asset_name;ip;created_utc;source;category
1;workstation;192.0.2.1;01/01/2026 12:30;endpoint;phishing
`,
    );

    const status = await waitForTerminalStatus(system.apiUrl, jobId);

    expect(status).toEqual({
      job_id: jobId,
      status: "completed",
      total_records: 1,
      successful_records: 1,
      failed_records: 0,
    });
    expect(system.heyeringRequests).toMatchObject([
      {
        authorization: HEYERING_API_TOKEN,
        body: {
          id: 1,
          asset: "workstation",
          ip: "192.0.2.1",
          category: "phishing",
        },
        path: "/enrichment",
      },
      {
        authorization: HEYERING_API_TOKEN,
        body: [
          {
            id: 1,
            asset: "workstation",
            ip: "192.0.2.1",
            category: "T1566",
            asn: "AS64500",
            correlationId: 1,
          },
        ],
        path: "/analytics",
      },
    ]);
  }, 20_000);

  it("records a terminal failure for an unsupported category", async function () {
    const system = getTestSystem();
    const jobId = await submitImport(
      system.apiUrl,
      `id;asset_name;ip;created_utc;source;category
2;server;192.0.2.2;01/01/2026 12:31;network;unsupported
`,
    );

    const status = await waitForTerminalStatus(system.apiUrl, jobId);

    expect(status).toEqual({
      job_id: jobId,
      status: "failed",
      total_records: 1,
      successful_records: 0,
      failed_records: 1,
    });
    expect(system.heyeringRequests).toEqual([]);

    const failures = await findImportFailures(system, jobId);

    expect(failures).toEqual([
      {
        record_id: "2",
        stage: "enrichment",
        payload: {
          id: 2,
          asset_name: "server",
          ip: "192.0.2.2",
          created_utc: "01/01/2026 12:31",
          source: "network",
          category: "unsupported",
        },
        reason: "Activity log category is not supported by Heyering",
      },
    ]);
  }, 20_000);

  it("records a non-retryable analytics failure", async function () {
    const system = getTestSystem();
    system.queueHeyeringResponse("analytics", { status: 400 });

    const jobId = await submitImport(
      system.apiUrl,
      `id;asset_name;ip;created_utc;source;category
5;gateway;192.0.2.5;01/01/2026 12:34;network;phishing
`,
    );
    const status = await waitForTerminalStatus(system.apiUrl, jobId);

    expect(status).toEqual({
      job_id: jobId,
      status: "failed",
      total_records: 1,
      successful_records: 0,
      failed_records: 1,
    });
    expect(await findImportFailures(system, jobId)).toEqual([
      {
        record_id: "5",
        stage: "analytics",
        payload: {
          id: 5,
          asset: "gateway",
          ip: "192.0.2.5",
          category: "T1566",
          asn: "AS64500",
          correlationId: 5,
        },
        reason: "Heyering analytics request failed with status 400",
      },
    ]);
    expect(requestsFor(system, "/analytics")).toHaveLength(1);
  }, 20_000);

  it("retries a transient enrichment failure without double-counting", async function () {
    const system = getTestSystem();
    system.queueHeyeringResponse("enrichment", { status: 500 });

    const jobId = await submitImport(
      system.apiUrl,
      `id;asset_name;ip;created_utc;source;category
6;desktop;192.0.2.6;01/01/2026 12:35;endpoint;phishing
`,
    );
    const status = await waitForTerminalStatus(system.apiUrl, jobId);

    expect(status).toEqual({
      job_id: jobId,
      status: "completed",
      total_records: 1,
      successful_records: 1,
      failed_records: 0,
    });
    expect(requestsFor(system, "/enrichment")).toHaveLength(2);
    expect(requestsFor(system, "/analytics")).toHaveLength(1);
    expect(await findImportFailures(system, jobId)).toEqual([]);
  }, 20_000);

  it("batches analytics requests and observes the configured interval", async function () {
    const system = getTestSystem();
    const recordIds = Array.from({ length: 21 }, function (_, index) {
      return 100 + index;
    });
    const csv = createCsv(
      recordIds.map(function (id) {
        return `${id};asset-${id};192.0.2.${id - 90};01/01/2026 12:36;endpoint;phishing`;
      }),
    );

    const jobId = await submitImport(system.apiUrl, csv);
    const status = await waitForTerminalStatus(system.apiUrl, jobId);
    const analyticsRequests = requestsFor(system, "/analytics");
    const batches = analyticsRequests.map(function (request) {
      return AnalyticsRequest.parse(request.body);
    });
    const ingestedIds = batches
      .flat()
      .map(function (event) {
        return event.id;
      })
      .toSorted(function (left, right) {
        return (left ?? 0) - (right ?? 0);
      });

    expect(status).toEqual({
      job_id: jobId,
      status: "completed",
      total_records: 21,
      successful_records: 21,
      failed_records: 0,
    });
    expect(analyticsRequests.length).toBeGreaterThanOrEqual(2);
    expect(
      batches.every(function (batch) {
        return batch.length <= 20;
      }),
    ).toBe(true);
    expect(ingestedIds).toEqual(recordIds);

    const intervals = analyticsRequests.flatMap(
      function (request, index, requests) {
        if (index === 0) return [];

        const previousRequest = requests.at(index - 1);
        return previousRequest
          ? [request.receivedAtMs - previousRequest.receivedAtMs]
          : [];
      },
    );
    expect(
      intervals.every(function (interval) {
        return interval >= 450;
      }),
    ).toBe(true);
  }, 20_000);

  it("finishes queued work after the pipeline restarts", async function () {
    const system = getTestSystem();
    for (let index = 0; index < 5; index += 1) {
      system.queueHeyeringResponse("enrichment", { delayMs: 500 });
    }

    const jobId = await submitImport(
      system.apiUrl,
      createCsv(
        Array.from({ length: 5 }, function (_, index) {
          const id = 200 + index;
          return `${id};asset-${id};192.0.2.${id - 190};01/01/2026 12:37;endpoint;phishing`;
        }),
      ),
    );

    await waitForHeyeringRequestCount(system, "/enrichment", 5);
    await system.restartPipeline();

    const status = await waitForTerminalStatus(system.apiUrl, jobId);

    expect(status).toEqual({
      job_id: jobId,
      status: "completed",
      total_records: 5,
      successful_records: 5,
      failed_records: 0,
    });
    expect(requestsFor(system, "/enrichment")).toHaveLength(5);
  }, 20_000);
});

function createCsv(rows: readonly string[]) {
  return `id;asset_name;ip;created_utc;source;category\n${rows.join("\n")}\n`;
}

function requestsFor(system: IntegrationTestSystem, path: string) {
  return system.heyeringRequests.filter(function (request) {
    return request.path === path;
  });
}

async function findImportFailures(
  system: IntegrationTestSystem,
  jobId: string,
) {
  return system.database`
    SELECT record_id, stage, payload, reason
    FROM import_failures
    WHERE import_id = ${jobId}
    ORDER BY record_id, stage
  `;
}

async function submitImport(apiUrl: URL, csv: string) {
  const response = await fetch(new URL("/imports", apiUrl), {
    method: "POST",
    headers: { "content-type": "text/csv" },
    body: csv,
  });
  const body: unknown = await response.json();

  expect(response.status).toBe(202);
  return UploadResponse.parse(body).job_id;
}

async function waitForTerminalStatus(apiUrl: URL, jobId: string) {
  while (true) {
    const response = await fetch(new URL(`/imports/${jobId}`, apiUrl));
    const body: unknown = await response.json();
    const status = UploadStatusResponse.parse(body);

    expect(response.status).toBe(200);

    if (status.status === "completed" || status.status === "failed") {
      return status;
    }

    await delay(100);
  }
}

async function waitForHeyeringRequestCount(
  system: IntegrationTestSystem,
  path: string,
  expectedCount: number,
) {
  while (requestsFor(system, path).length < expectedCount) {
    await delay(10);
  }
}
