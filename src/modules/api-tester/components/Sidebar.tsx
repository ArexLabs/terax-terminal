import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  FileAddIcon,
  Folder01Icon,
  FolderAddIcon,
  MessageEdit02Icon,
  PlusSignIcon,
  Upload04Icon,
  Download03Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRef, useState } from "react";
import { importPostmanCollection } from "../lib/postmanImporter";
import { parseCurl } from "../lib/curlParser";
import { useApiTesterStore } from "../lib/store";

function methodColor(m: string): string {
  if (m === "GET") return "text-emerald-600 dark:text-emerald-400";
  if (m === "POST") return "text-blue-600 dark:text-blue-400";
  if (m === "PUT") return "text-orange-600 dark:text-orange-400";
  if (m === "PATCH") return "text-amber-600 dark:text-amber-400";
  if (m === "DELETE") return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

export function Sidebar() {
  const collections = useApiTesterStore((s) => s.collections);
  const requests = useApiTesterStore((s) => s.requests);
  const activeRequestId = useApiTesterStore((s) => s.activeRequestId);
  const createCollection = useApiTesterStore((s) => s.createCollection);
  const deleteCollection = useApiTesterStore((s) => s.deleteCollection);
  const renameCollection = useApiTesterStore((s) => s.renameCollection);
  const createRequest = useApiTesterStore((s) => s.createRequest);
  const setActiveRequest = useApiTesterStore((s) => s.setActiveRequest);
  const deleteRequest = useApiTesterStore((s) => s.deleteRequest);
  const importCollection = useApiTesterStore((s) => s.importCollection);

  const fileRef = useRef<HTMLInputElement>(null);
  const [editingColl, setEditingColl] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const sorted = Object.values(collections).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const handleImportPostman = () => {
    fileRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const result = importPostmanCollection(text);
      if (result) {
        importCollection(result.requests);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handlePasteCurl = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const parsed = parseCurl(text);
      if (parsed) {
        const collId = createCollection("cURL");
        importCollection([parsed]);
        const renameFn = renameCollection;
        renameFn(collId, `cURL — ${parsed.url.slice(0, 50)}`);
      }
    } catch {}
  };

  const handleStartRename = (id: string, current: string) => {
    setEditingColl(id);
    setEditName(current);
  };

  const handleCommitRename = (id: string) => {
    if (editName.trim()) renameCollection(id, editName.trim());
    setEditingColl(null);
  };

  return (
    <div className="flex h-full flex-col border-r border-border/60 bg-sidebar/40">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border/60 px-2">
        <span className="flex-1 text-xs font-medium text-foreground/70">
          Collections
        </span>
        <input
          ref={fileRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-foreground"
          onClick={handleImportPostman}
          title="Import Postman collection"
        >
          <HugeiconsIcon icon={Download03Icon} size={13} strokeWidth={2} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-foreground"
          onClick={handlePasteCurl}
          title="Import cURL from clipboard"
        >
          <HugeiconsIcon icon={Upload04Icon} size={13} strokeWidth={2} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-foreground"
          onClick={() => createCollection("New Collection")}
          title="New collection"
        >
          <HugeiconsIcon icon={FolderAddIcon} size={13} strokeWidth={2} />
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {sorted.length === 0 && (
          <div className="px-3 py-8 text-center text-[11px] text-muted-foreground">
            No collections yet.
            <br />
            Create one or import a Postman collection.
          </div>
        )}
        {sorted.map((coll) => (
          <div key={coll.id}>
            <div className="flex items-center gap-1 px-2 py-1">
              {editingColl === coll.id ? (
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCommitRename(coll.id);
                    if (e.key === "Escape") setEditingColl(null);
                  }}
                  onBlur={() => handleCommitRename(coll.id)}
                  className="h-6 text-xs"
                  autoFocus
                />
              ) : (
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <button
                      className="flex flex-1 items-center gap-1.5 truncate rounded px-1 py-0.5 text-left text-xs font-medium text-foreground/80 hover:bg-accent/50"
                      onClick={() => {
                        // toggle collapse — we always show requests
                      }}
                    >
                      <HugeiconsIcon
                        icon={Folder01Icon}
                        size={13}
                        strokeWidth={2}
                        className="shrink-0 text-amber-600 dark:text-amber-400"
                      />
                      {coll.name}
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {coll.requestIds.length}
                      </span>
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="min-w-36">
                    <ContextMenuItem onSelect={() => createRequest(coll.id)}>
                      <HugeiconsIcon icon={PlusSignIcon} size={13} strokeWidth={2} />
                      New Request
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      onSelect={() => handleStartRename(coll.id, coll.name)}
                    >
                      <HugeiconsIcon icon={MessageEdit02Icon} size={13} strokeWidth={2} />
                      Rename
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => deleteCollection(coll.id)}>
                      <HugeiconsIcon icon={Delete02Icon} size={13} strokeWidth={2} />
                      Delete
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              )}
            </div>
            {coll.requestIds.map((rid) => {
              const req = requests[rid];
              if (!req) return null;
              return (
                <button
                  key={rid}
                  className={cn(
                    "flex w-full items-center gap-1.5 truncate py-1 pl-7 pr-2 text-left text-xs hover:bg-accent/40",
                    activeRequestId === rid
                      ? "bg-accent/60 text-foreground"
                      : "text-muted-foreground",
                  )}
                  onClick={() => setActiveRequest(rid)}
                  onDoubleClick={() => {}}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    // Simple delete on context menu
                    deleteRequest(rid);
                  }}
                >
                  <span className={cn("shrink-0 text-[10px] font-semibold", methodColor(req.method))}>
                    {req.method}
                  </span>
                  <span className="truncate">{req.name || req.url}</span>
                </button>
              );
            })}
            <div className="flex items-center gap-1 px-2 py-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="size-5 text-muted-foreground hover:text-foreground"
                onClick={() => createRequest(coll.id)}
                title="New request"
              >
                <HugeiconsIcon icon={FileAddIcon} size={11} strokeWidth={2} />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
