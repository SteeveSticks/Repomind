"use client";

import { useEffect, useState, type KeyboardEvent, type RefObject } from "react";
import { ArrowUpIcon, PlusIcon } from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  addLabel,
  addTooltip,
  composerPlaceholder,
  sendLabel,
} from "@/lib/placeholder-data";
import { cn } from "@/lib/utils";

type ComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  disabled?: boolean;
  placeholder?: string;
};

const singleLineHeight = 44;

export function Composer({
  value,
  onChange,
  onSend,
  inputRef,
  disabled = false,
  placeholder = composerPlaceholder,
}: ComposerProps) {
  const canSend = value.trim().length > 0 && !disabled;
  const [multiline, setMultiline] = useState(false);

  useEffect(() => {
    const field = inputRef.current;
    if (!field) {
      setMultiline(false);
      return;
    }
    setMultiline(value.includes("\n") || field.scrollHeight > singleLineHeight);
  }, [inputRef, value]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSend) {
        onSend();
      }
    }
  }

  return (
    <form
      className="mx-auto w-full max-w-3xl px-4 pb-3 md:px-10 md:pb-6 lg:px-16"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) {
          onSend();
        }
      }}
    >
      <label className="sr-only" htmlFor="composer-input">
        {placeholder}
      </label>
      <InputGroup
        className={cn(
          "h-auto min-h-10 bg-muted px-1 py-0 md:min-h-11 md:px-2 md:py-1",
          multiline ? "items-end rounded-lg" : "rounded-full",
          disabled && "opacity-60 cursor-not-allowed",
        )}
      >
        <InputGroupAddon align="inline-start" className="pl-1 md:pl-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <InputGroupButton
                  type="button"
                  aria-label={addLabel}
                  aria-disabled="true"
                  disabled={disabled}
                  className="h-9 w-9 min-h-9 min-w-9 rounded-full md:h-11 md:w-11 md:min-h-11 md:min-w-11"
                  onClick={(event) => event.preventDefault()}
                >
                  <PlusIcon aria-hidden />
                </InputGroupButton>
              }
            />
            <TooltipContent>{addTooltip}</TooltipContent>
          </Tooltip>
        </InputGroupAddon>
        <InputGroupTextarea
          id="composer-input"
          ref={inputRef}
          value={value}
          rows={1}
          disabled={disabled}
          placeholder={placeholder}
          className="max-h-40 min-h-9 overflow-y-auto py-2 text-base md:min-h-11 md:py-3 disabled:cursor-not-allowed"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <InputGroupAddon align="inline-end" className="pr-1 md:pr-2">
          <InputGroupButton
            type="submit"
            aria-label={sendLabel}
            disabled={!canSend}
            variant={canSend ? "default" : "ghost"}
            className={cn(
              "h-9 w-9 min-h-9 min-w-9 rounded-full md:h-11 md:w-11 md:min-h-11 md:min-w-11",
              canSend
                ? "text-primary-foreground [&_svg]:text-primary-foreground"
                : "text-muted-foreground",
            )}
          >
            <ArrowUpIcon aria-hidden />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}
