import type { ApiRequestState, HeaderEntry, HttpMethod, BodyType } from "./store";

function unescape(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && i + 1 < s.length) {
      const n = s[++i];
      if (n === "n") out += "\n";
      else if (n === "r") out += "\r";
      else if (n === "t") out += "\t";
      else if (n === "\\") out += "\\";
      else if (n === '"') out += '"';
      else if (n === "'") out += "'";
      else out += s[i];
    } else {
      out += s[i];
    }
  }
  return out;
}

function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === " " || line[i] === "\t") { i++; continue; }
    if (line[i] === '"') {
      i++;
      let tok = "";
      while (i < line.length && line[i] !== '"') {
        if (line[i] === "\\") { i++; if (i < line.length) tok += line[i++]; }
        else tok += line[i++];
      }
      i++; // skip closing "
      tokens.push(tok);
    } else if (line[i] === "'") {
      i++;
      let tok = "";
      while (i < line.length && line[i] !== "'") tok += line[i++];
      i++;
      tokens.push(tok);
    } else {
      let tok = "";
      while (i < line.length && line[i] !== " " && line[i] !== "\t") tok += line[i++];
      tokens.push(tok);
    }
  }
  return tokens;
}

export function parseCurl(input: string): ApiRequestState | null {
  const lines = input.replace(/\\\n/g, " ").replace(/\\\r\n/g, " ").trim();
  const tokens = tokenize(lines);
  if (tokens.length < 2 || tokens[0] !== "curl") return null;

  let method: HttpMethod = "GET";
  let url = "";
  const headers: HeaderEntry[] = [];
  let bodyType: BodyType = "none";
  let bodyContent = "";
  const bodyFormData: { key: string; value: string; enabled: boolean }[] = [];

  let i = 1;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t === "--request" || t === "-X") {
      const m = tokens[++i]?.toUpperCase();
      if (m && ["GET","POST","PUT","PATCH","DELETE","HEAD","OPTIONS"].includes(m)) {
        method = m as HttpMethod;
      }
    } else if (t === "--header" || t === "-H") {
      const raw = tokens[++i] ?? "";
      const sep = raw.indexOf(":");
      if (sep > 0) {
        const key = raw.slice(0, sep).trim();
        const value = raw.slice(sep + 1).trim();
        headers.push({ key, value: unescape(value), enabled: true });
      }
    } else if (t === "--data" || t === "-d" || t === "--data-raw") {
      const val = tokens[++i] ?? "";
      bodyType = "text";
      bodyContent = unescape(val);
    } else if (t === "--data-binary") {
      const val = tokens[++i] ?? "";
      bodyType = "text";
      bodyContent = unescape(val);
    } else if (t === "--json") {
      const val = tokens[++i] ?? "";
      bodyType = "json";
      bodyContent = unescape(val);
    } else if (t.startsWith("-") && t !== "--") {
      // skip unknown flags with their value
      const flag = t;
      if (flag === "--compressed" || flag === "-s" || flag === "-S" ||
          flag === "--silent" || flag === "-k" || flag === "--insecure" ||
          flag === "-L" || flag === "--location" || flag === "-i" ||
          flag === "--include" || flag === "-N" || flag === "--no-buffer" ||
          flag === "-v" || flag === "--verbose") {
        // flag without value
      } else if (i + 1 < tokens.length) {
        // assume next token is the value for this flag
        if (!tokens[i+1].startsWith("-")) i++;
      }
    } else if (!t.startsWith("-")) {
      url = t;
    }
    i++;
  }

  // Auto-detect JSON body
  if (bodyContent && bodyType === "text") {
    try {
      JSON.parse(bodyContent);
      bodyType = "json";
    } catch {}
  }

  // Determine method from body presence
  if (bodyContent && method === "GET") method = "POST";

  return {
    id: "",
    name: url ? url.replace(/^https?:\/\//, "").slice(0, 40) : "curl",
    collectionId: "",
    method,
    url,
    headers,
    params: [],
    bodyType,
    bodyContent,
    bodyFormData,
  };
}
