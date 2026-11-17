import { GripVertical, Plus, Trash2 } from "lucide-react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import { QuestionType } from "~/db/schema";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  addQuestion,
  moveQuestion,
  removeQuestion,
  updateQuestion,
  type SetWizard,
  type WizardQuestion,
  type WizardState,
} from "./wizard-state";

function QuestionTypeSelect({
  question,
  setWizard,
}: {
  question: WizardQuestion;
  setWizard: SetWizard;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs text-muted-foreground">Type:</Label>
      <Select
        value={question.type}
        onValueChange={(value) =>
          setWizard((prev) =>
            updateQuestion(prev, question.id, {
              type: value as QuestionType,
            })
          )
        }
      >
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={QuestionType.MultipleChoice}>
            Multiple Choice
          </SelectItem>
          <SelectItem value={QuestionType.TrueFalse}>True / False</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function QuestionFields({
  question,
  setWizard,
}: {
  question: WizardQuestion;
  setWizard: SetWizard;
}) {
  return (
    <div className="flex-1 space-y-3">
      <Input
        value={question.text}
        onChange={(event) =>
          setWizard((prev) =>
            updateQuestion(prev, question.id, {
              text: event.target.value,
            })
          )
        }
        placeholder="Enter question text..."
      />
      <QuestionTypeSelect question={question} setWizard={setWizard} />
    </div>
  );
}

function QuestionRow({
  question,
  index,
  setWizard,
}: {
  question: WizardQuestion;
  index: number;
  setWizard: SetWizard;
}) {
  return (
    <Draggable draggableId={question.id} index={index}>
      {(dragProvided, snapshot) => (
        <div
          ref={dragProvided.innerRef}
          {...dragProvided.draggableProps}
          className={`flex items-start gap-3 rounded-lg border p-4 ${
            snapshot.isDragging
              ? "bg-muted shadow-lg ring-2 ring-primary/20"
              : ""
          }`}
        >
          <div
            {...dragProvided.dragHandleProps}
            className="mt-2 cursor-grab text-muted-foreground hover:text-foreground"
          >
            <GripVertical className="size-4" />
          </div>
          <span className="mt-2 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
            {index + 1}
          </span>
          <QuestionFields question={question} setWizard={setWizard} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setWizard((prev) => removeQuestion(prev, question.id))
            }
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
    </Draggable>
  );
}

function QuestionList({
  wizard,
  setWizard,
}: {
  wizard: WizardState;
  setWizard: SetWizard;
}) {
  function handleQuestionDragEnd(result: DropResult) {
    if (!result.destination) return;
    const fromIndex = result.source.index;
    const toIndex = result.destination.index;
    if (fromIndex === toIndex) return;

    setWizard((prev) => moveQuestion(prev, fromIndex, toIndex));
  }

  return (
    <DragDropContext onDragEnd={handleQuestionDragEnd}>
      <Droppable droppableId="quiz-questions" type="question">
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="space-y-4"
          >
            {wizard.questions.map((q, idx) => (
              <QuestionRow
                key={q.id}
                question={q}
                index={idx}
                setWizard={setWizard}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}

export function QuestionsStep({
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
          <h2 className="text-lg font-semibold">Questions</h2>
          <p className="text-sm text-muted-foreground">
            Add questions to your quiz. Drag to reorder. You&apos;ll set answer
            options in the next step.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {wizard.questions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No questions added yet. Click &quot;Add Question&quot; to get
              started.
            </p>
          )}

          <QuestionList wizard={wizard} setWizard={setWizard} />

          <Button variant="outline" onClick={() => setWizard(addQuestion)}>
            <Plus className="mr-1.5 size-4" />
            Add Question
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
