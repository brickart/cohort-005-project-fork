import { Button } from "~/components/ui/button";

export function ConfirmDeletePrompt({
  label,
  buttonClassName,
  onConfirm,
  onCancel,
}: {
  label: string;
  buttonClassName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-destructive">{label}</span>
      <Button
        variant="destructive"
        size="sm"
        className={buttonClassName}
        onClick={onConfirm}
      >
        Confirm
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={buttonClassName}
        onClick={onCancel}
      >
        Cancel
      </Button>
    </div>
  );
}
