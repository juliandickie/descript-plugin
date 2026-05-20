import type { DescriptClient } from "../client/index.js";
import type { ImportRequest } from "../client/types.js";
import { importAndWait } from "./importAndWait.js";
import { editAndWait } from "./editAndWait.js";
import { publishAndWait } from "./publishAndWait.js";
import type { PollOptions } from "./poll.js";

export interface BatchItem {
  name: string;
  source: { url: string } | { file: string; content_type: string };
  project_id?: string;
  project_name?: string;
  agent_prompt?: string;
  publish?: { media_type?: "Video" | "Audio"; resolution?: "480p" | "720p" | "1080p" | "1440p" | "4K"; access_level?: "public" | "unlisted" | "private" };
}
export interface BatchManifest {
  concurrency: number;
  callback_url?: string;
  items: BatchItem[];
}

export function parseManifest(raw: unknown): BatchManifest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Batch manifest must be a JSON object with an `items` array.");
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.items) || obj.items.length === 0) {
    throw new Error("Batch manifest must have a non-empty `items` array.");
  }
  const items: BatchItem[] = obj.items.map((it, idx) => {
    const i = it as Record<string, unknown>;
    if (!i.source || typeof i.source !== "object") {
      throw new Error(`Manifest item ${idx} is missing a \`source\` (url or file).`);
    }
    const s = i.source as Record<string, unknown>;
    const hasUrl = typeof s.url === "string";
    const hasFile = typeof s.file === "string" && typeof s.content_type === "string";
    if (!hasUrl && !hasFile) {
      throw new Error(`Manifest item ${idx} \`source\` must be {url} or {file, content_type}.`);
    }
    if (!hasUrl) {
      throw new Error(
        `Manifest item ${idx} uses a local file source; the batch runner is URL-only. Use \`descript import\` for local file uploads.`
      );
    }
    return {
      name: typeof i.name === "string" ? i.name : `item-${idx}`,
      source: i.source as BatchItem["source"],
      project_id: typeof i.project_id === "string" ? i.project_id : undefined,
      project_name: typeof i.project_name === "string" ? i.project_name : undefined,
      agent_prompt: typeof i.agent_prompt === "string" ? i.agent_prompt : undefined,
      publish: i.publish as BatchItem["publish"] | undefined
    };
  });
  const concurrency = typeof obj.concurrency === "number" && obj.concurrency > 0 ? obj.concurrency : 2;
  return {
    concurrency,
    callback_url: typeof obj.callback_url === "string" ? obj.callback_url : undefined,
    items
  };
}

export interface BatchPlan {
  itemCount: number;
  willImport: number;
  willEdit: number;
  willPublish: number;
  lines: string[];
  summary: string;
}

export function planBatch(m: BatchManifest): BatchPlan {
  const lines = m.items.map((it) => {
    const parts = [`import(${"url" in it.source ? it.source.url : it.source.file})`];
    if (it.agent_prompt) parts.push(`agent("${it.agent_prompt}")`);
    if (it.publish) parts.push(`publish(${it.publish.media_type ?? "Video"} ${it.publish.resolution ?? ""})`.trim());
    return `- ${it.name}: ${parts.join(" -> ")}`;
  });
  const willEdit = m.items.filter((i) => i.agent_prompt).length;
  const willPublish = m.items.filter((i) => i.publish).length;
  return {
    itemCount: m.items.length,
    willImport: m.items.length,
    willEdit,
    willPublish,
    lines,
    summary: `${m.items.length} item(s): ${m.items.length} import, ${willEdit} agent edit, ${willPublish} publish. Concurrency ${m.concurrency}. This will spend AI credits and media seconds.`
  };
}

export interface BatchItemReport {
  name: string;
  status: "success" | "failed";
  projectId?: string;
  projectUrl?: string;
  shareUrl?: string;
  aiCreditsUsed?: number;
  error?: string;
}
export interface BatchReport {
  total: number;
  succeeded: number;
  failed: number;
  items: BatchItemReport[];
}

export interface RunBatchOptions {
  confirm: boolean;
  poll?: PollOptions;
  onItemEvent?: (event: { name: string; phase: string; detail?: string }) => void;
}

async function runItem(client: DescriptClient, item: BatchItem, m: BatchManifest, opts: RunBatchOptions): Promise<BatchItemReport> {
  const emit = (phase: string, detail?: string) => opts.onItemEvent?.({ name: item.name, phase, detail });
  try {
    if (!("url" in item.source)) {
      throw new Error(`Item "${item.name}" uses a local file source; run it via the CLI import path, not the in-memory batch path.`);
    }
    const importReq: ImportRequest = {
      project_id: item.project_id,
      project_name: item.project_name ?? item.name,
      add_media: { [`${item.name}.media`]: { url: item.source.url } },
      add_compositions: [{ name: item.name, clips: [{ media: `${item.name}.media` }] }],
      callback_url: m.callback_url
    };
    emit("import");
    const imp = await importAndWait(client, importReq, opts.poll);
    if (!imp.ok) return { name: item.name, status: "failed", error: imp.error ?? "import failed" };
    let aiCredits: number | undefined;

    if (item.agent_prompt) {
      emit("agent");
      const ed = await editAndWait(client, { project_id: imp.projectId, prompt: item.agent_prompt, callback_url: m.callback_url }, opts.poll);
      if (!ed.ok) return { name: item.name, status: "failed", projectId: imp.projectId, error: ed.error ?? "agent failed" };
      aiCredits = ed.aiCreditsUsed;
    }

    let shareUrl: string | undefined;
    if (item.publish) {
      emit("publish");
      const pub = await publishAndWait(client, {
        project_id: imp.projectId,
        media_type: item.publish.media_type,
        resolution: item.publish.resolution,
        access_level: item.publish.access_level,
        callback_url: m.callback_url
      }, opts.poll);
      if (!pub.ok) return { name: item.name, status: "failed", projectId: imp.projectId, error: pub.error ?? "publish failed" };
      shareUrl = pub.shareUrl;
    }
    return { name: item.name, status: "success", projectId: imp.projectId, projectUrl: imp.projectUrl, shareUrl, aiCreditsUsed: aiCredits };
  } catch (e) {
    return { name: item.name, status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}

export async function runBatch(client: DescriptClient, m: BatchManifest, opts: RunBatchOptions): Promise<BatchReport> {
  if (!opts.confirm) {
    throw new Error("Batch execution requires explicit confirmation. Run the plan first, then re-run with confirm.");
  }
  const queue: Array<[number, BatchItem]> = m.items.map((item, idx) => [idx, item]);
  const results = new Array<BatchItemReport>(m.items.length);
  const workers = Array.from({ length: Math.min(m.concurrency, queue.length) }, async () => {
    for (;;) {
      const entry = queue.shift();
      if (!entry) return;
      const [idx, item] = entry;
      results[idx] = await runItem(client, item, m, opts);
    }
  });
  await Promise.all(workers);
  const succeeded = results.filter((r) => r.status === "success").length;
  return { total: m.items.length, succeeded, failed: m.items.length - succeeded, items: results };
}
