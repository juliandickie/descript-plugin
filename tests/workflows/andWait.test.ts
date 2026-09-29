import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { DescriptClient } from "../../src/client/index.js";
import { importAndWait, importDriveMediaAndWait, normalizeDriveImportJob } from "../../src/workflows/importAndWait.js";
import type { JobStatus } from "../../src/client/types.js";
import { editAndWait } from "../../src/workflows/editAndWait.js";
import { publishAndWait } from "../../src/workflows/publishAndWait.js";
import { installMockFetch, restoreFetch } from "../helpers/mockFetch.js";

afterEach(() => restoreFetch());
const noSleep = async () => {};

test("editAndWait submits, polls, and normalizes the agent outcome", async () => {
  installMockFetch([
    { status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } },
    { status: 200, json: { job_id: "j", job_type: "agent", job_state: "running", created_at: "t", drive_id: "d", project_id: "p", project_url: "u" } },
    { status: 200, json: { job_id: "j", job_type: "agent", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p", project_url: "u",
        result: { status: "success", agent_response: "Added captions", project_changed: true, ai_credits_used: 32, media_seconds_used: 10, conversation_id: "conv_123", resolved_model: "claude-haiku-4.5" } } }
  ]);
  const client = new DescriptClient({ token: "t" });
  const out = await editAndWait(client, { project_id: "p", prompt: "add captions" }, { intervalMs: 1, sleep: noSleep });
  assert.equal(out.ok, true);
  assert.equal(out.projectUrl, "u");
  assert.equal(out.agentResponse, "Added captions");
  assert.equal(out.aiCreditsUsed, 32);
  assert.equal(out.resolvedModel, "claude-haiku-4.5");
  assert.equal(out.conversationId, "conv_123");
});

test("editAndWait surfaces a failed job result as ok:false", async () => {
  installMockFetch([
    { status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } },
    { status: 200, json: { job_id: "j", job_type: "agent", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p", project_url: "u",
        result: { status: "error", error_message: "agent failed", error_code: "agent_execution_failed" } } }
  ]);
  const client = new DescriptClient({ token: "t" });
  const out = await editAndWait(client, { project_id: "p", prompt: "x" }, { intervalMs: 1, sleep: noSleep });
  assert.equal(out.ok, false);
  assert.match(out.error ?? "", /agent failed/);
});

test("importAndWait normalizes media status and compositions", async () => {
  installMockFetch([
    { status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } },
    { status: 200, json: { job_id: "j", job_type: "import/project_media", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p", project_url: "u",
        result: { status: "success", media_status: { "a.mp4": { status: "success", duration_seconds: 5 } }, media_seconds_used: 5, created_compositions: [{ id: "c1", name: "Cut" }] } } }
  ]);
  const client = new DescriptClient({ token: "t" });
  const out = await importAndWait(client, { project_name: "P", add_media: { "a.mp4": { url: "https://x/a.mp4" } } }, { intervalMs: 1, sleep: noSleep });
  assert.equal(out.ok, true);
  assert.equal(out.createdCompositions[0]!.name, "Cut");
});

test("publishAndWait returns the share url", async () => {
  installMockFetch([
    { status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } },
    { status: 200, json: { job_id: "j", job_type: "publish", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p", project_url: "u",
        result: { status: "success", composition_id: "c1", share_url: "https://share.descript.com/view/x" } } }
  ]);
  const client = new DescriptClient({ token: "t" });
  const out = await publishAndWait(client, { project_id: "p" }, { intervalMs: 1, sleep: noSleep });
  assert.equal(out.ok, true);
  assert.equal(out.shareUrl, "https://share.descript.com/view/x");
});

test("importAndWait returns ok:false and failedMedia on partial import", async () => {
  installMockFetch([
    { status: 201, json: { job_id: "j", drive_id: "d", project_id: "p", project_url: "u" } },
    { status: 200, json: { job_id: "j", job_type: "import/project_media", job_state: "stopped", created_at: "t",
        drive_id: "d", project_id: "p", project_url: "u",
        result: { status: "partial",
          media_status: {
            "good.mp4": { status: "success", duration_seconds: 10 },
            "bad.mp4":  { status: "failed", error_message: "unsupported codec" }
          },
          media_seconds_used: 10,
          created_compositions: [{ id: "c1", name: "Cut" }] } } }
  ]);
  const client = new DescriptClient({ token: "t" });
  const out = await importAndWait(client, { project_name: "P", add_media: { "good.mp4": { url: "u1" }, "bad.mp4": { url: "u2" } } }, { intervalMs: 1, sleep: noSleep });
  assert.equal(out.ok, false);
  assert.equal(out.status, "partial");
  assert.equal(out.failedMedia.length, 1);
  assert.equal(out.failedMedia[0]!.ref, "bad.mp4");
  assert.match(out.failedMedia[0]!.error, /unsupported codec/);
  assert.equal(out.createdCompositions.length, 1);
});

const driveJob = (result?: unknown, extra: Record<string, unknown> = {}): JobStatus => ({
  job_id: "j", job_type: "import/drive_media", job_state: "stopped", created_at: "t", drive_id: "d", ...(result === undefined ? {} : { result }), ...extra
}) as JobStatus;
const driveSubmit = { job_id: "j", drive_id: "dsub" };

test("importDriveMediaAndWait submits to the drive endpoint, polls and normalizes the outcome", async () => {
  const { calls } = installMockFetch([
    { status: 201, json: { job_id: "j", drive_id: "d" } },
    { status: 200, json: driveJob(undefined, { job_state: "running" }) },
    { status: 200, json: driveJob({ status: "success", media_status: { "a.mp4": { status: "success", duration_seconds: 5 } }, media_seconds_used: 5 }) }
  ]);
  const client = new DescriptClient({ token: "t" });
  const out = await importDriveMediaAndWait(client, { add_media: { "a.mp4": { url: "https://x/a.mp4" } } }, { intervalMs: 1, sleep: noSleep });
  assert.equal(calls[0]!.url, "https://descriptapi.com/v1/jobs/import/drive_media");
  assert.equal(out.ok, true);
  assert.equal(out.jobId, "j");
  assert.equal(out.driveId, "d");
  assert.equal(out.status, "success");
  assert.equal(out.mediaSecondsUsed, 5);
  assert.deepEqual(out.mediaStatus, { "a.mp4": { status: "success", duration_seconds: 5 } });
});

test("normalizeDriveImportJob reads success from result.status alone", () => {
  const out = normalizeDriveImportJob(driveSubmit, driveJob({ status: "success" }));
  assert.equal(out.ok, true);
  assert.equal(out.status, "success");
  assert.equal(out.driveId, "dsub");
  assert.equal(out.mediaStatus, undefined);
  assert.equal(out.error, undefined);
});

test("normalizeDriveImportJob turns an error result into ok:false with its message and raw result", () => {
  const result = { status: "error", error_message: "bad media", error_code: "invalid_media" };
  const out = normalizeDriveImportJob(driveSubmit, driveJob(result));
  assert.equal(out.ok, false);
  assert.equal(out.status, "error");
  assert.equal(out.error, "bad media");
  assert.deepEqual(out.result, result);
});

test("normalizeDriveImportJob treats a job with no result as an error", () => {
  const out = normalizeDriveImportJob(driveSubmit, driveJob());
  assert.equal(out.ok, false);
  assert.equal(out.status, "error");
  assert.match(out.error ?? "", /stopped without a result/i);
});

test("normalizeDriveImportJob is not ok when a file failed, and names it", () => {
  const out = normalizeDriveImportJob(driveSubmit, driveJob({ status: "partial", media_status: { "a.mp4": { status: "success" }, "b.mp4": { status: "failed", error_message: "unsupported codec" } } }));
  assert.equal(out.ok, false);
  assert.equal(out.status, "partial");
  assert.match(out.error ?? "", /b\.mp4: unsupported codec/);
});

test("normalizeDriveImportJob reports an unrecognised status instead of guessing", () => {
  const out = normalizeDriveImportJob(driveSubmit, driveJob({ status: "weird" }));
  assert.equal(out.ok, false);
  assert.equal(out.status, "weird");
  assert.match(out.error ?? "", /weird/);
});

test("normalizeDriveImportJob rejects a job of another type", () => {
  assert.throws(
    () => normalizeDriveImportJob(driveSubmit, { job_id: "j", job_type: "agent", job_state: "stopped", created_at: "t", drive_id: "d", project_id: "p", project_url: "u" }),
    /Unexpected job_type "agent"/
  );
});
