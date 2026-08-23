"use client";

import { useEffect, useRef } from "react";
import { Bold, Italic, Heading1, Heading2, List, ListOrdered, Link2, Code, Quote, Table as TableIcon, Undo2, Redo2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lightweight contentEditable editor with a formatting toolbar.
 * Produces sanitized-ish HTML (execCommand based); server also strips tags
 * for plain-text contexts. For heavyweight needs swap in TipTap later -
 * the interface stays `value: string`.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder = "Add description...",
  minHeight = 140,
  className,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && value !== ref.current.innerHTML && document.activeElement !== ref.current) {
      ref.current.innerHTML = value || "";
    }
  }, [value]);

  const exec = (cmd: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    emit();
  };

  const emit = () => {
    if (ref.current) onChange(ref.current.innerHTML);
  };

  const addLink = () => {
    const url = window.prompt("Link URL", "https://");
    if (url && /^https?:\/\//i.test(url)) exec("createLink", url);
  };

  const insertTable = () => {
    const html = `<table><thead><tr><th>Column</th><th>Column</th></tr></thead><tbody><tr><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr></tbody></table><p><br/></p>`;
    ref.current?.focus();
    document.execCommand("insertHTML", false, html);
    emit();
  };

  const btn = "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground";

  return (
    <div className={cn("overflow-hidden rounded-lg border border-input bg-card focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20", className)}>
      <div className="flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1" role="toolbar" aria-label="Formatting">
        <button type="button" className={btn} onClick={() => exec("bold")} aria-label="Bold"><Bold className="h-3.5 w-3.5" /></button>
        <button type="button" className={btn} onClick={() => exec("italic")} aria-label="Italic"><Italic className="h-3.5 w-3.5" /></button>
        <span className="mx-0.5 h-4 w-px bg-border" />
        <button type="button" className={btn} onClick={() => exec("formatBlock", "<h1>")} aria-label="Heading 1"><Heading1 className="h-3.5 w-3.5" /></button>
        <button type="button" className={btn} onClick={() => exec("formatBlock", "<h2>")} aria-label="Heading 2"><Heading2 className="h-3.5 w-3.5" /></button>
        <button type="button" className={btn} onClick={() => exec("formatBlock", "<p>")} aria-label="Paragraph"><span className="text-[10px] font-semibold">P</span></button>
        <span className="mx-0.5 h-4 w-px bg-border" />
        <button type="button" className={btn} onClick={() => exec("insertUnorderedList")} aria-label="Bullet list"><List className="h-3.5 w-3.5" /></button>
        <button type="button" className={btn} onClick={() => exec("insertOrderedList")} aria-label="Numbered list"><ListOrdered className="h-3.5 w-3.5" /></button>
        <button type="button" className={btn} onClick={addLink} aria-label="Insert link"><Link2 className="h-3.5 w-3.5" /></button>
        <span className="mx-0.5 h-4 w-px bg-border" />
        <button type="button" className={btn} onClick={() => exec("formatBlock", "<pre>")} aria-label="Code block"><Code className="h-3.5 w-3.5" /></button>
        <button type="button" className={btn} onClick={() => exec("formatBlock", "<blockquote>")} aria-label="Quote"><Quote className="h-3.5 w-3.5" /></button>
        <button type="button" className={btn} onClick={insertTable} aria-label="Insert table"><TableIcon className="h-3.5 w-3.5" /></button>
        <span className="mx-0.5 h-4 w-px bg-border" />
        <button type="button" className={btn} onClick={() => exec("undo")} aria-label="Undo"><Undo2 className="h-3.5 w-3.5" /></button>
        <button type="button" className={btn} onClick={() => exec("redo")} aria-label="Redo"><Redo2 className="h-3.5 w-3.5" /></button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        className="rte-content w-full overflow-y-auto px-3.5 py-3 text-sm leading-relaxed"
        style={{ minHeight }}
        onPaste={(e) => {
          // Paste as plain-ish HTML to avoid junk markup
          e.preventDefault();
          const text = e.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, text);
          emit();
        }}
      />
    </div>
  );
}
