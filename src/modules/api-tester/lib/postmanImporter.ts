import type { ApiRequestState, HeaderEntry, HttpMethod, BodyType } from "./store";

type PostmanCollection = {
  info: { name?: string; schema?: string };
  item?: PostmanItem[];
};

type PostmanItem = {
  name?: string;
  request?: PostmanRequest;
  item?: PostmanItem[];
};

type PostmanRequest = {
  method?: string;
  url?: PostmanUrl | string;
  header?: PostmanHeader[];
  body?: PostmanBody;
};

type PostmanUrl = {
  raw?: string;
  query?: { key: string; value: string }[];
};

type PostmanHeader = {
  key: string;
  value: string;
  disabled?: boolean;
};

type PostmanBody = {
  mode?: string;
  raw?: string;
  options?: { raw?: { language?: string } };
  urlencoded?: { key: string; value: string; disabled?: boolean }[];
  formdata?: { key: string; value: string; disabled?: boolean }[];
};

function parsePostmanRequest(
  item: PostmanItem,
  collectionId: string,
): ApiRequestState[] {
  const result: ApiRequestState[] = [];

  if (item.request) {
    const req = item.request;
    const url = resolveUrl(req.url);
    const headers: HeaderEntry[] = (req.header ?? []).map((h) => ({
      key: h.key,
      value: h.value,
      enabled: !h.disabled,
    }));
    const params: HeaderEntry[] = [];
    if (typeof req.url !== "string" && req.url?.query) {
      for (const q of req.url.query) {
        params.push({ key: q.key, value: q.value ?? "", enabled: true });
      }
    }

    let bodyType: BodyType = "none";
    let bodyContent = "";
    let bodyFormData: { key: string; value: string; enabled: boolean }[] = [];

    if (req.body) {
      const b = req.body;
      if (b.mode === "raw") {
        const lang = b.options?.raw?.language;
        bodyType = lang === "json" ? "json" : "text";
        bodyContent = b.raw ?? "";
      } else if (b.mode === "urlencoded") {
        bodyType = "form-urlencoded";
        bodyFormData = (b.urlencoded ?? []).map((f) => ({
          key: f.key,
          value: f.value,
          enabled: !f.disabled,
        }));
      } else if (b.mode === "formdata") {
        bodyType = "form-data";
        bodyFormData = (b.formdata ?? []).map((f) => ({
          key: f.key,
          value: f.value,
          enabled: !f.disabled,
        }));
      }
    }

    result.push({
      id: "",
      name: item.name ?? "Untitled",
      collectionId,
      method: (req.method as HttpMethod) ?? "GET",
      url,
      headers,
      params,
      bodyType,
      bodyContent,
      bodyFormData,
    });
  }

  if (item.item) {
    for (const sub of item.item) {
      result.push(...parsePostmanRequest(sub, collectionId));
    }
  }

  return result;
}

function resolveUrl(url: PostmanUrl | string | undefined): string {
  if (!url) return "";
  if (typeof url === "string") return url;
  return url.raw ?? "";
}

export function importPostmanCollection(
  json: string,
): { name: string; requests: ApiRequestState[] } | null {
  try {
    const parsed: PostmanCollection = JSON.parse(json);
    if (!parsed || !parsed.info) return null;

    const requests: ApiRequestState[] = [];
    if (parsed.item) {
      for (const item of parsed.item) {
        requests.push(...parsePostmanRequest(item, ""));
      }
    }

    return { name: parsed.info.name ?? "Imported", requests };
  } catch {
    return null;
  }
}
