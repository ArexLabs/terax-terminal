import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useEffect } from "react";
import { RequestEditor } from "./components/RequestEditor";
import { ResponsePane } from "./components/ResponsePane";
import { Sidebar } from "./components/Sidebar";
import { useApiTesterStore } from "./lib/store";

export function ApiTesterPane() {
  const init = useApiTesterStore((s) => s.init);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div className="flex h-full w-full">
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel id="api-sidebar" defaultSize={22} minSize={15} maxSize={35}>
          <Sidebar />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel id="api-main" defaultSize={48} minSize={30}>
          <RequestEditor />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel id="api-response" defaultSize={30} minSize={20}>
          <ResponsePane />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
