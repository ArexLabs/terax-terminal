import type { Tab } from "@/modules/tabs/lib/useTabs";
import { ApiTesterPane } from "./ApiTesterPane";

type Props = {
  tabs: Tab[];
  activeId: number;
};

export function ApiTesterStack({ tabs, activeId }: Props) {
  const active = tabs.find((t) => t.id === activeId && t.kind === "api-tester");
  if (!active) return null;

  return (
    <div className="h-full w-full">
      <ApiTesterPane />
    </div>
  );
}
