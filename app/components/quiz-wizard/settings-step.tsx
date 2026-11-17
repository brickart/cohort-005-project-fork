import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { SetWizard, WizardState } from "./wizard-state";

export function SettingsStep({
  wizard,
  setWizard,
}: {
  wizard: WizardState;
  setWizard: SetWizard;
}) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">Quiz Settings</h2>
        <p className="text-sm text-muted-foreground">
          Set the quiz title and passing score.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="quizTitle">Quiz Title</Label>
          <Input
            id="quizTitle"
            value={wizard.title}
            onChange={(event) =>
              setWizard((prev) => ({ ...prev, title: event.target.value }))
            }
            placeholder="e.g. Module 1 Quiz"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="passingScore">Passing Score (%)</Label>
          <Input
            id="passingScore"
            type="number"
            min={0}
            max={100}
            value={wizard.passingScore}
            onChange={(event) =>
              setWizard((prev) => ({
                ...prev,
                passingScore: parseInt(event.target.value, 10) || 0,
              }))
            }
            className="max-w-32"
          />
        </div>
      </CardContent>
    </Card>
  );
}
