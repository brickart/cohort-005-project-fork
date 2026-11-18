import { useState, useRef, useEffect } from "react";

export function useInlineEdit<
  T extends HTMLInputElement | HTMLTextAreaElement,
>({
  value,
  onCommit,
  isSaveKey,
}: {
  value: string;
  onCommit: (trimmed: string) => void;
  isSaveKey: (event: React.KeyboardEvent) => boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const ref = useRef<T>(null);

  useEffect(() => {
    if (isEditing && ref.current) {
      ref.current.focus();
      ref.current.select();
    }
  }, [isEditing]);

  // Update local state when server responds with new data
  useEffect(() => {
    setEditValue(value);
  }, [value]);

  function save() {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== value) {
      onCommit(trimmed);
    }
    setIsEditing(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (isSaveKey(event)) {
      event.preventDefault();
      save();
    } else if (event.key === "Escape") {
      setEditValue(value);
      setIsEditing(false);
    }
  }

  return {
    isEditing,
    startEditing: () => setIsEditing(true),
    editValue,
    setEditValue,
    ref,
    save,
    onKeyDown,
  };
}

export function isEnter(event: React.KeyboardEvent) {
  return event.key === "Enter";
}

export function isModifierEnter(event: React.KeyboardEvent) {
  return event.key === "Enter" && (event.metaKey || event.ctrlKey);
}
