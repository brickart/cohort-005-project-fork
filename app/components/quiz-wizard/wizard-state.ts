import { QuestionType } from "~/db/schema";

// ─── Types for wizard state ───

export type WizardOption = {
  id: string;
  text: string;
  isCorrect: boolean;
};

export type WizardQuestion = {
  id: string;
  text: string;
  type: QuestionType;
  options: WizardOption[];
};

export type WizardState = {
  title: string;
  passingScore: number;
  questions: WizardQuestion[];
};

export type SetWizard = (
  update: WizardState | ((prev: WizardState) => WizardState)
) => void;

type ExistingQuiz = {
  title: string;
  passingScore: number;
  questions: {
    questionText: string;
    questionType: string;
    options: { optionText: string; isCorrect: boolean }[];
  }[];
};

export function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

// Initialize wizard state from existing quiz or defaults
export function initialWizard(existingQuiz: ExistingQuiz | null): WizardState {
  if (existingQuiz) {
    return {
      title: existingQuiz.title,
      passingScore: Math.round(existingQuiz.passingScore * 100),
      questions: existingQuiz.questions.map((q) => ({
        id: generateId(),
        text: q.questionText,
        type: q.questionType as QuestionType,
        options: q.options.map((o) => ({
          id: generateId(),
          text: o.optionText,
          isCorrect: o.isCorrect,
        })),
      })),
    };
  }
  return {
    title: "",
    passingScore: 70,
    questions: [],
  };
}

// ─── Step 2: Questions ───

export function addQuestion(prev: WizardState): WizardState {
  return {
    ...prev,
    questions: [
      ...prev.questions,
      {
        id: generateId(),
        text: "",
        type: QuestionType.MultipleChoice,
        options: [
          { id: generateId(), text: "", isCorrect: true },
          { id: generateId(), text: "", isCorrect: false },
        ],
      },
    ],
  };
}

export function removeQuestion(
  prev: WizardState,
  questionId: string
): WizardState {
  return {
    ...prev,
    questions: prev.questions.filter((q) => q.id !== questionId),
  };
}

function updatedQuestion(
  q: WizardQuestion,
  updates: Partial<WizardQuestion>
): WizardQuestion {
  const updated = { ...q, ...updates };
  // When switching to TrueFalse, reset options to True/False
  if (
    updates.type === QuestionType.TrueFalse &&
    q.type !== QuestionType.TrueFalse
  ) {
    updated.options = [
      { id: generateId(), text: "True", isCorrect: true },
      { id: generateId(), text: "False", isCorrect: false },
    ];
  }
  // When switching to MultipleChoice from TrueFalse, add blank options
  if (
    updates.type === QuestionType.MultipleChoice &&
    q.type !== QuestionType.MultipleChoice
  ) {
    updated.options = [
      { id: generateId(), text: "", isCorrect: true },
      { id: generateId(), text: "", isCorrect: false },
    ];
  }
  return updated;
}

export function updateQuestion(
  prev: WizardState,
  questionId: string,
  updates: Partial<WizardQuestion>
): WizardState {
  return {
    ...prev,
    questions: prev.questions.map((q) =>
      q.id === questionId ? updatedQuestion(q, updates) : q
    ),
  };
}

export function moveQuestion(
  prev: WizardState,
  fromIndex: number,
  toIndex: number
): WizardState {
  const reordered = [...prev.questions];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);
  return { ...prev, questions: reordered };
}

// ─── Step 3: Answers ───

function mapOptions(
  prev: WizardState,
  questionId: string,
  map: (options: WizardOption[]) => WizardOption[]
): WizardState {
  return {
    ...prev,
    questions: prev.questions.map((q) =>
      q.id === questionId ? { ...q, options: map(q.options) } : q
    ),
  };
}

export function addOption(prev: WizardState, questionId: string) {
  return mapOptions(prev, questionId, (options) => [
    ...options,
    { id: generateId(), text: "", isCorrect: false },
  ]);
}

export function removeOption(
  prev: WizardState,
  questionId: string,
  optionId: string
) {
  return mapOptions(prev, questionId, (options) =>
    options.filter((o) => o.id !== optionId)
  );
}

export function updateOptionText(
  prev: WizardState,
  { questionId, optionId }: { questionId: string; optionId: string },
  text: string
) {
  return mapOptions(prev, questionId, (options) =>
    options.map((o) => (o.id === optionId ? { ...o, text } : o))
  );
}

export function setCorrectOption(
  prev: WizardState,
  questionId: string,
  optionId: string
) {
  return mapOptions(prev, questionId, (options) =>
    options.map((o) => ({ ...o, isCorrect: o.id === optionId }))
  );
}

// ─── Step 4: Review ───

export function validationErrors(wizard: WizardState): string[] {
  const errors: string[] = [];
  if (!wizard.title.trim()) errors.push("Quiz title is required.");
  if (wizard.questions.length === 0)
    errors.push("At least one question is required.");
  for (const q of wizard.questions) {
    const n = wizard.questions.indexOf(q) + 1;
    if (!q.text.trim()) errors.push(`Question ${n} has no text.`);
    if (q.options.length < 2)
      errors.push(`Question ${n} needs at least 2 options.`);
    if (!q.options.some((o) => o.isCorrect))
      errors.push(`Question ${n} has no correct answer.`);
    for (const opt of q.options) {
      if (!opt.text.trim()) errors.push(`Question ${n} has an empty option.`);
    }
  }
  return errors;
}

// ─── Navigation ───

export function canGoNext(step: number, wizard: WizardState) {
  if (step === 1) return wizard.title.trim().length > 0;
  if (step === 2) return wizard.questions.length > 0;
  if (step === 3) return true;
  return false;
}
