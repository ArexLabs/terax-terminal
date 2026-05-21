import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  AddCircleIcon,
  Delete02Icon,
  PlayIcon,
  StopIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useApiTesterStore, type ApiRequestState, type BodyType, type HttpMethod } from "../lib/store";

const METHODS: HttpMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

export function RequestEditor() {
  const activeRequestId = useApiTesterStore((s) => s.activeRequestId);
  const requests = useApiTesterStore((s) => s.requests);
  const sending = useApiTesterStore((s) => s.sending);
  const updateRequest = useApiTesterStore((s) => s.updateRequest);
  const sendRequest = useApiTesterStore((s) => s.sendRequest);
  const cancelRequest = useApiTesterStore((s) => s.cancelRequest);

  const req: ApiRequestState | undefined = activeRequestId
    ? requests[activeRequestId]
    : undefined;

  if (!req) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Select a request to edit
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* URL bar */}
      <div className="flex items-center gap-1.5 border-b border-border/60 px-3 py-2">
        <Select
          value={req.method}
          onValueChange={(v) => updateRequest(req.id, { method: v as HttpMethod })}
        >
          <SelectTrigger className={cn("h-7 w-24 text-xs font-semibold", methodTextColor(req.method))}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METHODS.map((m) => (
              <SelectItem key={m} value={m} className="text-xs">
                <span className={methodTextColor(m)}>{m}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={req.url}
          onChange={(e) => updateRequest(req.id, { url: e.target.value })}
          placeholder="https://api.example.com/endpoint"
          className="h-7 flex-1 text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !sending) sendRequest();
          }}
        />
        {sending ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={cancelRequest}
          >
            <HugeiconsIcon icon={StopIcon} size={13} strokeWidth={2} />
            Cancel
          </Button>
        ) : (
          <Button
            variant="default"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={sendRequest}
            disabled={!req.url}
          >
            <HugeiconsIcon icon={PlayIcon} size={13} strokeWidth={2} />
            Send
          </Button>
        )}
      </div>

      {/* Tabbed editor */}
      <div className="min-h-0 flex-1">
        <Tabs defaultValue="params" className="flex h-full flex-col">
          <TabsList className="h-8 justify-start gap-0 rounded-none border-b border-border/60 bg-transparent px-2">
            <TabTrigger value="params">Params</TabTrigger>
            <TabTrigger value="headers">Headers</TabTrigger>
            <TabTrigger value="body">Body</TabTrigger>
          </TabsList>
          <TabsContent value="params" className="mt-0 flex-1 overflow-y-auto p-2">
            <KeyValueEditor
              entries={req.params}
              onChange={(params) => updateRequest(req.id, { params })}
              placeholderKey="param"
            />
          </TabsContent>
          <TabsContent value="headers" className="mt-0 flex-1 overflow-y-auto p-2">
            <KeyValueEditor
              entries={req.headers}
              onChange={(headers) => updateRequest(req.id, { headers })}
              placeholderKey="Header-Name"
            />
          </TabsContent>
          <TabsContent value="body" className="mt-0 flex h-full flex-col p-2">
            <Select
              value={req.bodyType}
              onValueChange={(v) => updateRequest(req.id, { bodyType: v as BodyType })}
            >
              <SelectTrigger className="h-7 w-32 text-xs mb-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-xs">none</SelectItem>
                <SelectItem value="json" className="text-xs">JSON</SelectItem>
                <SelectItem value="text" className="text-xs">Text</SelectItem>
                <SelectItem value="form-urlencoded" className="text-xs">URL-Encoded</SelectItem>
              </SelectContent>
            </Select>
            {req.bodyType === "json" || req.bodyType === "text" ? (
              <Textarea
                value={req.bodyContent}
                onChange={(e) => updateRequest(req.id, { bodyContent: e.target.value })}
                placeholder={req.bodyType === "json" ? '{ "key": "value" }' : "Raw body content"}
                className="min-h-0 flex-1 resize-none font-mono text-xs"
              />
            ) : req.bodyType === "form-urlencoded" ? (
              <KeyValueEditor
                entries={req.bodyFormData}
                onChange={(formData) => updateRequest(req.id, { bodyFormData: formData })}
                placeholderKey="field"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                This request does not have a body
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

type KeyValueEntry = { key: string; value: string; enabled: boolean };

function KeyValueEditor({
  entries,
  onChange,
  placeholderKey,
}: {
  entries: KeyValueEntry[];
  onChange: (entries: KeyValueEntry[]) => void;
  placeholderKey: string;
}) {
  const add = () => {
    onChange([...entries, { key: "", value: "", enabled: true }]);
  };

  const update = (i: number, patch: Partial<KeyValueEntry>) => {
    const next = entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e));
    onChange(next);
  };

  const remove = (i: number) => {
    onChange(entries.filter((_, idx) => idx !== i));
  };

  return (
    <div className="flex flex-col gap-1">
      {entries.map((e, i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={e.enabled}
            onChange={(ev) => update(i, { enabled: ev.target.checked })}
            className="size-3 shrink-0 accent-foreground"
          />
          <Input
            value={e.key}
            onChange={(ev) => update(i, { key: ev.target.value })}
            placeholder={placeholderKey}
            className="h-6 w-40 text-xs"
          />
          <Input
            value={e.value}
            onChange={(ev) => update(i, { value: ev.target.value })}
            placeholder="value"
            className="h-6 flex-1 text-xs"
          />
          <button
            onClick={() => remove(i)}
            className="shrink-0 text-muted-foreground hover:text-destructive"
          >
            <HugeiconsIcon icon={Delete02Icon} size={13} strokeWidth={2} />
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={AddCircleIcon} size={13} strokeWidth={2} />
        Add
      </button>
    </div>
  );
}

function TabTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <TabsTrigger
      value={value}
      className="h-full rounded-none border-b-2 border-transparent px-3 text-xs font-medium text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground"
    >
      {children}
    </TabsTrigger>
  );
}

function methodTextColor(m: string): string {
  if (m === "GET") return "text-emerald-600 dark:text-emerald-400";
  if (m === "POST") return "text-blue-600 dark:text-blue-400";
  if (m === "PUT") return "text-orange-600 dark:text-orange-400";
  if (m === "PATCH") return "text-amber-600 dark:text-amber-400";
  if (m === "DELETE") return "text-red-600 dark:text-red-400";
  return "";
}
