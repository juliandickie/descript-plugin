import { test } from "node:test";
import assert from "node:assert/strict";
import { pollJob } from "../../src/workflows/poll.js";
import type { JobStatus } from "../../src/client/types.js";

function fakeGetJob(states: JobStatus[]): () => Promise<JobStatus> {
  let i = 0;
  return async () => states[Math.min(i++, states.length - 1)]!;
}
const base = { job_id: "j", drive_id: "d", project_id: "p", project_url: "u", created_at: "t" } as const;

test("polls until job_state is stopped and returns the final status", async () => {
  const get = fakeGetJob([
    { ...base, job_type: "agent", job_state: "queued" },
    { ...base, job_type: "agent", job_state: "running" },
    { ...base, job_type: "agent", job_state: "stopped", result: { status: "success", agent_response: "ok", project_changed: true } }
  ]);
  const final = await pollJob(get, "j", { intervalMs: 1, sleep: async () => {} });
  assert.equal(final.job_state, "stopped");
});

test("rejects when the job is cancelled", async () => {
  const get = fakeGetJob([{ ...base, job_type: "agent", job_state: "cancelled" }]);
  await assert.rejects(() => pollJob(get, "j", { intervalMs: 1, sleep: async () => {} }), /cancelled/);
});

test("rejects on timeout", async () => {
  const get = fakeGetJob([{ ...base, job_type: "agent", job_state: "running" }]);
  await assert.rejects(
    () => pollJob(get, "j", { intervalMs: 5, maxWaitMs: 12, sleep: async () => {}, now: makeClock() }),
    /timed out/
  );
});

function makeClock(): () => number {
  let t = 0;
  return () => (t += 10);
}
