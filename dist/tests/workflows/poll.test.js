import { test } from "node:test";
import assert from "node:assert/strict";
import { pollJob } from "../../src/workflows/poll.js";
import { DescriptApiError } from "../../src/client/errors.js";
function fakeGetJob(states) {
    let i = 0;
    return async () => states[Math.min(i++, states.length - 1)];
}
const base = { job_id: "j", drive_id: "d", project_id: "p", project_url: "u", created_at: "t" };
test("polls until job_state is stopped and returns the final status", async () => {
    const get = fakeGetJob([
        { ...base, job_type: "agent", job_state: "queued" },
        { ...base, job_type: "agent", job_state: "running" },
        { ...base, job_type: "agent", job_state: "stopped", result: { status: "success", agent_response: "ok", project_changed: true } }
    ]);
    const final = await pollJob(get, "j", { intervalMs: 1, sleep: async () => { } });
    assert.equal(final.job_state, "stopped");
});
test("rejects when the job is cancelled", async () => {
    const get = fakeGetJob([{ ...base, job_type: "agent", job_state: "cancelled" }]);
    await assert.rejects(() => pollJob(get, "j", { intervalMs: 1, sleep: async () => { } }), /cancelled/);
});
test("rejects on timeout", async () => {
    const get = fakeGetJob([{ ...base, job_type: "agent", job_state: "running" }]);
    await assert.rejects(() => pollJob(get, "j", { intervalMs: 5, maxWaitMs: 12, sleep: async () => { }, now: makeClock() }), /timed out/);
});
function makeClock() {
    let t = 0;
    return () => (t += 10);
}
test("retries a transient 5xx getJob error then succeeds", async () => {
    let i = 0;
    const get = async () => {
        i += 1;
        if (i <= 2)
            throw new DescriptApiError(503, { error: "server_error", message: "boom" });
        return { ...base, job_type: "agent", job_state: "stopped", result: { status: "success", agent_response: "ok", project_changed: true } };
    };
    const final = await pollJob(get, "j", { intervalMs: 1, sleep: async () => { } });
    assert.equal(final.job_state, "stopped");
    assert.equal(i, 3);
});
test("retries a transient network (non-API) getJob error then succeeds", async () => {
    let i = 0;
    const get = async () => {
        i += 1;
        if (i <= 2)
            throw new TypeError("fetch failed");
        return { ...base, job_type: "agent", job_state: "stopped", result: { status: "success", agent_response: "ok", project_changed: true } };
    };
    const final = await pollJob(get, "j", { intervalMs: 1, sleep: async () => { } });
    assert.equal(final.job_state, "stopped");
});
test("does not retry a non-transient getJob error (404)", async () => {
    let i = 0;
    const get = async () => {
        i += 1;
        throw new DescriptApiError(404, { error: "not_found", message: "no job" });
    };
    await assert.rejects(() => pollJob(get, "j", { intervalMs: 1, sleep: async () => { } }), (e) => e instanceof DescriptApiError && e.status === 404);
    assert.equal(i, 1);
});
test("gives up after maxPollRetries on a persistent transient error", async () => {
    let i = 0;
    const get = async () => {
        i += 1;
        throw new DescriptApiError(503, { error: "server_error", message: "down" });
    };
    await assert.rejects(() => pollJob(get, "j", { intervalMs: 1, maxPollRetries: 2, sleep: async () => { } }), (e) => e instanceof DescriptApiError && e.status === 503);
    assert.equal(i, 3);
});
