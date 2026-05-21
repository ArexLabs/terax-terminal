import { invoke, Channel } from "@tauri-apps/api/core";
import { create } from "zustand";

const STORAGE_KEY = "terax-api-tester";
const SAVE_DEBOUNCE_MS = 300;

export type HttpMethod =
  | "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export type HeaderEntry = { key: string; value: string; enabled: boolean };
export type FormDataEntry = { key: string; value: string; enabled: boolean };
export type BodyType = "none" | "json" | "text" | "form-urlencoded" | "form-data";

export type ApiCollection = {
  id: string;
  name: string;
  requestIds: string[];
};

export type ApiRequestState = {
  id: string;
  name: string;
  collectionId: string;
  method: HttpMethod;
  url: string;
  headers: HeaderEntry[];
  params: HeaderEntry[];
  bodyType: BodyType;
  bodyContent: string;
  bodyFormData: FormDataEntry[];
};

export type ApiResponse = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  sizeBytes: number;
  timeMs: number;
  streaming: boolean;
} | null;

type Store = {
  collections: Record<string, ApiCollection>;
  requests: Record<string, ApiRequestState>;
  activeRequestId: string | null;
  response: ApiResponse;
  sending: boolean;
  init: () => void;
  createCollection: (name: string) => string;
  deleteCollection: (id: string) => void;
  renameCollection: (id: string, name: string) => void;
  createRequest: (collectionId: string) => string;
  setActiveRequest: (id: string | null) => void;
  updateRequest: (id: string, patch: Partial<ApiRequestState>) => void;
  deleteRequest: (id: string) => void;
  sendRequest: () => Promise<void>;
  cancelRequest: () => void;
  importCollection: (requests: ApiRequestState[]) => void;
};

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(get: () => Store) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const s = get();
    const data = { collections: s.collections, requests: s.requests };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
  }, SAVE_DEBOUNCE_MS);
}

function load(): { collections: Record<string, ApiCollection>; requests: Record<string, ApiRequestState> } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { collections: {}, requests: {} };
}

let abortController: AbortController | null = null;

export const useApiTesterStore = create<Store>((set, get) => ({
  collections: {},
  requests: {},
  activeRequestId: null,
  response: null,
  sending: false,

  init: () => {
    const data = load();
    set({ collections: data.collections, requests: data.requests });
  },

  createCollection: (name) => {
    const id = genId();
    set((s) => ({
      collections: { ...s.collections, [id]: { id, name, requestIds: [] } },
    }));
    scheduleSave(get);
    return id;
  },

  deleteCollection: (id) => {
    set((s) => {
      const coll = s.collections[id];
      if (!coll) return s;
      const next = { ...s.collections };
      delete next[id];
      const requests = { ...s.requests };
      for (const rid of coll.requestIds) delete requests[rid];
      let active = s.activeRequestId;
      if (active && !requests[active]) active = null;
      return { collections: next, requests, activeRequestId: active };
    });
    scheduleSave(get);
  },

  renameCollection: (id, name) => {
    set((s) => ({
      collections: {
        ...s.collections,
        [id]: { ...s.collections[id], name },
      },
    }));
    scheduleSave(get);
  },

  createRequest: (collectionId) => {
    const id = genId();
    const request: ApiRequestState = {
      id,
      name: "New Request",
      collectionId,
      method: "GET",
      url: "",
      headers: [],
      params: [],
      bodyType: "none",
      bodyContent: "",
      bodyFormData: [],
    };
    set((s) => ({
      requests: { ...s.requests, [id]: request },
      collections: {
        ...s.collections,
        [collectionId]: {
          ...s.collections[collectionId],
          requestIds: [...s.collections[collectionId].requestIds, id],
        },
      },
      activeRequestId: id,
    }));
    scheduleSave(get);
    return id;
  },

  setActiveRequest: (id) => {
    set({ activeRequestId: id, response: null });
  },

  updateRequest: (id, patch) => {
    set((s) => {
      const existing = s.requests[id];
      if (!existing) return s;
      return { requests: { ...s.requests, [id]: { ...existing, ...patch } } };
    });
    scheduleSave(get);
  },

  deleteRequest: (id) => {
    set((s) => {
      const req = s.requests[id];
      if (!req) return s;
      const next = { ...s.requests };
      delete next[id];
      const coll = s.collections[req.collectionId];
      let active = s.activeRequestId;
      if (active === id) active = null;
      return {
        requests: next,
        collections: coll
          ? {
              ...s.collections,
              [req.collectionId]: {
                ...coll,
                requestIds: coll.requestIds.filter((r) => r !== id),
              },
            }
          : s.collections,
        activeRequestId: active,
      };
    });
    scheduleSave(get);
  },

  sendRequest: async () => {
    const req = get().requests[get().activeRequestId ?? ""];
    if (!req || get().sending) return;

    set({ response: null, sending: true });
    abortController = new AbortController();
    const signal = abortController.signal;

    const startTime = performance.now();
    let sizeBytes = 0;
    let status = 0;
    let responseHeaders: Record<string, string> = {};
    let body = "";

    try {
      const url = buildUrl(req);
      const method = req.method;
      const headers = buildHeaders(req);
      const bodyBytes = buildBody(req);

      if (signal.aborted) return;

      const channel = new Channel<AiStreamEvent>();

      await new Promise<void>((resolve, reject) => {
        channel.onmessage = (event) => {
          if (signal.aborted) return;

          if (event.kind === "headers") {
            status = event.status;
            responseHeaders = event.headers;
            set({ sending: true });
          } else if (event.kind === "chunk") {
            sizeBytes += event.bytes.length;
            const text = new TextDecoder().decode(
              new Uint8Array(event.bytes),
            );
            body += text;
            set({
              response: {
                status,
                statusText: statusText(status),
                headers: responseHeaders,
                body,
                sizeBytes,
                timeMs: 0,
                streaming: true,
              },
            });
          } else if (event.kind === "end") {
            const elapsed = performance.now() - startTime;
            set({
              response: {
                status,
                statusText: statusText(status),
                headers: responseHeaders,
                body,
                sizeBytes,
                timeMs: Math.round(elapsed),
                streaming: false,
              },
              sending: false,
            });
            resolve();
          } else if (event.kind === "error") {
            reject(new Error(event.message));
          }
        };

        invoke("ai_http_stream", {
          url,
          method,
          headers: Object.keys(headers).length > 0 ? headers : undefined,
          body: bodyBytes,
          onEvent: channel,
        }).catch((e) => reject(e));
      });
    } catch (e) {
      const elapsed = performance.now() - startTime;
      const msg = e instanceof Error ? e.message : String(e);
      set({
        response: {
          status: 0,
          statusText: "Error",
          headers: {},
          body: msg,
          sizeBytes: msg.length,
          timeMs: Math.round(elapsed),
          streaming: false,
        },
        sending: false,
      });
    }
  },

  cancelRequest: () => {
    abortController?.abort();
    abortController = null;
    set((s) => ({
      sending: false,
      response: s.response ? { ...s.response, streaming: false } : null,
    }));
  },

  importCollection: (requests) => {
    const collId = genId();
    const requestIds: string[] = [];
    const reqMap: Record<string, ApiRequestState> = {};
    for (const r of requests) {
      const id = genId();
      requestIds.push(id);
      reqMap[id] = { ...r, id, collectionId: collId };
    }
    set((s) => ({
      collections: {
        ...s.collections,
        [collId]: { id: collId, name: "Imported", requestIds },
      },
      requests: { ...s.requests, ...reqMap },
      activeRequestId: requestIds[0] ?? s.activeRequestId,
    }));
    scheduleSave(get);
  },
}));

function buildUrl(req: ApiRequestState): string {
  let url = req.url;
  const enabled = req.params.filter((p) => p.enabled && p.key);
  if (enabled.length > 0) {
    const qs = enabled
      .map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
      .join("&");
    url += (url.includes("?") ? "&" : "?") + qs;
  }
  return url;
}

function buildHeaders(
  req: ApiRequestState,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of req.headers) {
    if (h.enabled && h.key) out[h.key] = h.value;
  }
  return out;
}

function buildBody(
  req: ApiRequestState,
): number[] | undefined {
  if (req.bodyType === "none") return undefined;
  if (req.bodyType === "json" || req.bodyType === "text") {
    return Array.from(new TextEncoder().encode(req.bodyContent));
  }
  if (req.bodyType === "form-urlencoded") {
    const pairs = req.bodyFormData
      .filter((f) => f.enabled && f.key)
      .map(
        (f) =>
          `${encodeURIComponent(f.key)}=${encodeURIComponent(f.value)}`,
      );
    return Array.from(new TextEncoder().encode(pairs.join("&")));
  }
  // form-data is not supported via the streaming command; fall back to text
  return Array.from(new TextEncoder().encode(req.bodyContent));
}

type AiStreamEvent =
  | { kind: "headers"; status: number; headers: Record<string, string> }
  | { kind: "chunk"; bytes: number[] }
  | { kind: "end" }
  | { kind: "error"; message: string };

function statusText(code: number): string {
  const m: Record<number, string> = {
    200: "OK", 201: "Created", 204: "No Content",
    301: "Moved", 302: "Found", 304: "Not Modified",
    400: "Bad Request", 401: "Unauthorized", 403: "Forbidden",
    404: "Not Found", 405: "Method Not Allowed", 409: "Conflict",
    422: "Unprocessable", 429: "Too Many Requests",
    500: "Server Error", 502: "Bad Gateway", 503: "Unavailable",
  };
  return m[code] ?? "";
}
