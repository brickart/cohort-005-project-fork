import { QuestionType } from "~/db/schema";
import type { WizardQuestion } from "./wizard-state";

export function QuestionHeading({
  question,
  index,
}: {
  question: WizardQuestion;
  index: number;
}) {
  return (
    <>
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
        {index + 1}
      </span>
      <span className="font-medium">
        {question.text || "(No question text)"}
      </span>
      <span className="ml-auto text-xs text-muted-foreground">
        {question.type === QuestionType.TrueFalse
          ? "True/False"
          : "Multiple Choice"}
      </span>
    </>
  );
}
