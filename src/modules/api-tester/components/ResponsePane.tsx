import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useApiTesterStore } from "../lib/store";

export function ResponsePane() {
  const response = useApiTesterStore((s) => s.response);
  const sending = useApiTesterStore((s) => s.sending);

  if (sending && !response) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
        <Spinner className="size-4" />
        Sending request…
      </div>
    );
  }

  if (!response) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Send a request to see the response
      </div>
    );
  }

  const statusColor =
    response.status >= 200 && response.status < 300
      ? "bg-emerald-600/20 text-emerald-600 dark:bg-emerald-400/20 dark:text-emerald-400"
      : response.status >= 400
        ? "bg-red-600/20 text-red-600 dark:bg-red-400/20 dark:text-red-400"
        : "bg-amber-600/20 text-amber-600 dark:bg-amber-400/20 dark:text-amber-400";

  return (
    <div className="flex h-full flex-col border-t border-border/60">
      {/* Status bar */}
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5 text-xs">
        <Badge className={cn("px-1.5 py-0 text-[10px] font-medium", statusColor)} variant="secondary">
          {response.status || "—"}
        </Badge>
        {response.status > 0 && (
          <span className="text-muted-foreground">{response.statusText}</span>
        )}
        <span className="ml-auto flex items-center gap-3 text-muted-foreground">
          {response.sizeBytes > 0 && (
            <span>{formatBytes(response.sizeBytes)}</span>
          )}
          {response.timeMs > 0 && (
            <span>{response.timeMs}ms</span>
          )}
          {response.streaming && (
            <span className="flex items-center gap-1 text-blue-500">
              <span className="size-1.5 animate-pulse rounded-full bg-blue-500" />
              Streaming
            </span>
          )}
        </span>
      </div>

      {/* Body + Headers tabs */}
      <div className="min-h-0 flex-1">
        <Tabs defaultValue="body" className="flex h-full flex-col">
          <TabsList className="h-8 justify-start gap-0 rounded-none border-b border-border/60 bg-transparent px-2">
            <ResponseTabTrigger value="body">Body</ResponseTabTrigger>
            <ResponseTabTrigger value="headers">Headers</ResponseTabTrigger>
          </TabsList>
          <TabsContent value="body" className="mt-0 flex-1 overflow-auto">
            <pre className="p-3 text-xs leading-relaxed">
              <code>{response.body || "(empty)"}</code>
            </pre>
          </TabsContent>
          <TabsContent value="headers" className="mt-0 flex-1 overflow-auto p-3">
            {Object.keys(response.headers).length === 0 ? (
              <span className="text-xs text-muted-foreground">No headers</span>
            ) : (
              <table className="w-full text-xs">
                <tbody>
                  {Object.entries(response.headers).map(([k, v]) => (
                    <tr key={k} className="border-b border-border/40">
                      <td className="w-1/3 py-1 pr-2 font-medium text-foreground/70">
                        {k}
                      </td>
                      <td className="py-1 text-muted-foreground break-all">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function ResponseTabTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <TabsTrigger
      value={value}
      className="h-full rounded-none border-b-2 border-transparent px-3 text-xs font-medium text-muted-foreground data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:text-foreground"
    >
      {children}
    </TabsTrigger>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
