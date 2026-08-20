"use client";

import {
  BookOpenIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  collapseSidebarLabel,
  expandSidebarLabel,
  newChatLabel,
  recentsHeading,
  settingsLabel,
  wordmark,
} from "@/lib/placeholder-data";

export type SidebarSource = {
  id: string;
  identity: string;
  latestJobStatus?: string;
};

type SidebarNavProps = {
  view: "new" | "thread";
  sources: SidebarSource[];
  activeSourceId: string | null;
  collapsed?: boolean;
  showCollapse?: boolean;
  onNewChat: () => void;
  onSelectSource: (sourceId: string) => void;
  onOpenSettings: (trigger: HTMLButtonElement) => void;
  onToggleCollapse?: () => void;
};

export function SidebarNav({
  view,
  sources,
  activeSourceId,
  collapsed = false,
  showCollapse = false,
  onNewChat,
  onSelectSource,
  onOpenSettings,
  onToggleCollapse,
}: SidebarNavProps) {
  const collapseLabel = collapsed ? expandSidebarLabel : collapseSidebarLabel;

  return (
    <div
      className={cn(
        "flex h-full flex-col gap-4 p-4",
        collapsed && "items-center px-2",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2",
          collapsed ? "flex-col" : "justify-between",
        )}
      >
        {collapsed ? null : (
          <p className="px-2 text-base font-semibold text-foreground">
            {wordmark}
          </p>
        )}
        {showCollapse ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={collapseLabel}
            aria-expanded={!collapsed}
            className="min-h-11 min-w-11 shrink-0 rounded-full bg-transparent hover:bg-muted aria-expanded:bg-transparent hover:aria-expanded:bg-muted"
            onClick={onToggleCollapse}
          >
            {collapsed ? (
              <PanelLeftOpenIcon aria-hidden />
            ) : (
              <PanelLeftCloseIcon aria-hidden />
            )}
          </Button>
        ) : null}
      </div>
      <Button
        variant="ghost"
        size={collapsed ? "icon" : "default"}
        aria-label={collapsed ? newChatLabel : undefined}
        className={cn(
          "bg-transparent font-medium hover:bg-muted",
          collapsed
            ? "min-h-11 min-w-11 rounded-full"
            : "min-h-11 justify-start gap-2",
        )}
        onClick={onNewChat}
      >
        <PlusIcon
          data-icon={collapsed ? undefined : "inline-start"}
          aria-hidden
        />
        {collapsed ? null : newChatLabel}
      </Button>
      {collapsed ? null : (
        <>
          <Separator />
          <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
            <h2 className="px-2 text-sm font-semibold text-foreground">
              {recentsHeading}
            </h2>
            {sources.length === 0 ? (
              <p className="px-2 text-xs text-muted-foreground">
                No indexed repositories yet.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {sources.map((source) => {
                  const selected =
                    view === "thread" && activeSourceId === source.id;
                  return (
                    <li key={source.id}>
                      <Button
                        variant="ghost"
                        aria-current={selected ? "true" : undefined}
                        className={cn(
                          "min-h-11 w-full justify-start gap-2 font-medium truncate",
                          selected && "bg-muted",
                        )}
                        onClick={() => onSelectSource(source.id)}
                      >
                        <BookOpenIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="truncate">{source.identity}</span>
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
      <Button
        variant="ghost"
        size="icon"
        aria-label={settingsLabel}
        className="mt-auto min-h-11 min-w-11 rounded-full bg-transparent hover:bg-muted"
        onClick={(event) => onOpenSettings(event.currentTarget)}
      >
        <SettingsIcon aria-hidden />
      </Button>
    </div>
  );
}
