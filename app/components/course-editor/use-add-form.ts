import { useState, useRef, useEffect } from "react";
import type { Fetcher } from "./use-fetcher-toast";

export function useAddForm(
  fetcher: Fetcher,
  onSubmit: (trimmed: string) => void
) {
  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  // Reset form after successful submission
  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.success) {
      setTitle("");
      setIsAdding(false);
    }
  }, [fetcher.state, fetcher.data]);

  function close() {
    setTitle("");
    setIsAdding(false);
  }

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      close();
    }
  }

  return {
    isAdding,
    open: () => setIsAdding(true),
    close,
    title,
    setTitle,
    inputRef,
    submit,
    onKeyDown,
  };
}
