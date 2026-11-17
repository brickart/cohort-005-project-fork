import { Check, Plus, Trash2 } from "lucide-react";
import { QuestionType } from "~/db/schema";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { QuestionHeading } from "./question-heading";
import {
  addOption,
  removeOption,
  setCorrectOption,
  updateOptionText,
  type SetWizard,
  type WizardOption,
  type WizardQuestion,
  type WizardState,
} from "./wizard-state";

function CorrectToggle({
  isCorrect,
  onClick,
}: {
  isCorrect: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
        isCorrect
          ? "border-green-500 bg-green-500 text-white"
          : "border-muted-foreground/30 hover:border-green-500/50"
      }`}
    >
      {isCorrect && <Check className="size-3" />}
    </button>
  );
}

function OptionRow({
  question,
  option,
  setWizard,
}: {
  question: WizardQuestion;
  option: WizardOption;
  setWizard: SetWizard;
}) {
  const ids = { questionId: question.id, optionId: option.id };
  return (
    <div className="flex items-center gap-2">
      <CorrectToggle
        isCorrect={option.isCorrect}
        onClick={() =>
          setWizard((prev) => setCorrectOption(prev, question.id, option.id))
        }
      />
      {question.type === QuestionType.TrueFalse ? (
        <span className="text-sm">{option.text}</span>
      ) : (
        <Input
          value={option.text}
          onChange={(event) =>
            setWizard((prev) => updateOptionText(prev, ids, event.target.value))
          }
          placeholder="Enter option text..."
          className="flex-1"
        />
      )}
      {question.type === QuestionType.MultipleChoice &&
        question.options.length > 2 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setWizard((prev) => removeOption(prev, question.id, option.id))
            }
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-3" />
          </Button>
        )}
    </div>
  );
}

function QuestionOptions({
  question,
  index,
  setWizard,
}: {
  question: WizardQuestion;
  index: number;
  setWizard: SetWizard;
}) {
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center gap-2">
        <QuestionHeading question={question} index={index} />
      </div>

      <div className="space-y-2">
        {question.options.map((opt) => (
          <OptionRow
            key={opt.id}
            question={question}
            option={opt}
            setWizard={setWizard}
          />
        ))}
      </div>

      {question.type === QuestionType.MultipleChoice && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setWizard((prev) => addOption(prev, question.id))}
          className="mt-2"
        >
          <Plus className="mr-1 size-3" />
          Add Option
        </Button>
      )}
    </div>
  );
}

export function AnswersStep({
  wizard,
  setWizard,
}: {
  wizard: WizardState;
  setWizard: SetWizard;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Answer Options</h2>
          <p className="text-sm text-muted-foreground">
            Set answer options for each question and mark the correct answer.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {wizard.questions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Go back and add questions first.
            </p>
          )}

          {wizard.questions.map((q, idx) => (
            <QuestionOptions
              key={q.id}
              question={q}
              index={idx}
              setWizard={setWizard}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
