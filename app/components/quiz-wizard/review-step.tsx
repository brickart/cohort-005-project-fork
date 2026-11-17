import { CheckCircle2, Save, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { QuestionHeading } from "./question-heading";
import {
  validationErrors as getValidationErrors,
  type WizardQuestion,
  type WizardState,
} from "./wizard-state";

function QuizSummary({ wizard }: { wizard: WizardState }) {
  return (
    <div className="rounded-lg bg-muted/50 p-4">
      <div className="space-y-1 text-sm">
        <div>
          <span className="font-medium">Title:</span>{" "}
          {wizard.title || "(empty)"}
        </div>
        <div>
          <span className="font-medium">Passing Score:</span>{" "}
          {wizard.passingScore}%
        </div>
        <div>
          <span className="font-medium">Questions:</span>{" "}
          {wizard.questions.length}
        </div>
      </div>
    </div>
  );
}

function QuestionReview({
  question,
  index,
}: {
  question: WizardQuestion;
  index: number;
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-2 flex items-center gap-2">
        <QuestionHeading question={question} index={index} />
      </div>
      <div className="ml-8 space-y-1">
        {question.options.map((opt) => (
          <div key={opt.id} className="flex items-center gap-2 text-sm">
            {opt.isCorrect ? (
              <CheckCircle2 className="size-4 text-green-500" />
            ) : (
              <XCircle className="size-4 text-muted-foreground/40" />
            )}
            <span className={opt.isCorrect ? "font-medium text-green-700" : ""}>
              {opt.text || "(empty)"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ValidationErrors({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
      <p className="mb-2 text-sm font-medium text-destructive">
        Please fix these issues before saving:
      </p>
      <ul className="list-inside list-disc space-y-1 text-sm text-destructive">
        {errors.map((error, i) => (
          // oxlint-disable-next-line react/no-array-index-key -- messages can repeat, and the list is rebuilt on every render
          <li key={i}>{error}</li>
        ))}
      </ul>
    </div>
  );
}

export type SaveState = {
  saving: boolean;
  isEditing: boolean;
  error?: string;
  onSave: () => void;
};

function SaveQuizButton({
  disabled,
  save,
}: {
  disabled: boolean;
  save: SaveState;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button disabled={disabled || save.saving} onClick={save.onSave}>
        <Save className="mr-1.5 size-4" />
        {save.saving
          ? "Saving..."
          : save.isEditing
            ? "Update Quiz"
            : "Create Quiz"}
      </Button>

      {save.error && (
        <span className="text-sm text-destructive">{save.error}</span>
      )}
    </div>
  );
}

export function ReviewStep({
  wizard,
  save,
}: {
  wizard: WizardState;
  save: SaveState;
}) {
  const validationErrors = getValidationErrors(wizard);
  const isValid = validationErrors.length === 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Review Quiz</h2>
          <p className="text-sm text-muted-foreground">
            Review your quiz before saving.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <QuizSummary wizard={wizard} />

          {wizard.questions.map((q, idx) => (
            <QuestionReview key={q.id} question={q} index={idx} />
          ))}

          <ValidationErrors errors={validationErrors} />

          <SaveQuizButton disabled={!isValid} save={save} />
        </CardContent>
      </Card>
    </div>
  );
}
