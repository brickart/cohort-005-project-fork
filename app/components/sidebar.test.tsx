import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { UserRole } from "~/db/schema";
import { SidebarUserCard } from "./sidebar";

function renderUserCard(name: string) {
  const user = { id: 1, name, role: UserRole.Student, avatarUrl: null };
  const Stub = createRoutesStub([
    { path: "/", Component: () => <SidebarUserCard user={user} /> },
  ]);
  return renderToStaticMarkup(<Stub initialEntries={["/"]} />);
}

describe("SidebarUserCard", () => {
  it("shows the full name, wrapping to two lines instead of one", () => {
    const html = renderUserCard("Emma Wilson");
    expect(html).toContain(">Emma Wilson</div>");
    expect(html).toContain("line-clamp-2");
    expect(html).not.toMatch(/class="[^"]*\btruncate\b[^"]*"[^>]*>Emma Wilson/);
  });

  it("puts the full name in a tooltip for names longer than two lines", () => {
    const name = "Bartholomew Maximilian Featherstonehaugh-Cholmondeley";
    expect(renderUserCard(name)).toContain(`title="${name}"`);
  });

  it("shows the role under the name", () => {
    expect(renderUserCard("Emma Wilson")).toContain(">student</div>");
  });

  it("gives Settings and Sign out labelled buttons of their own", () => {
    const html = renderUserCard("Emma Wilson");
    expect(html).toMatch(/<a[^>]*href="\/settings"[^>]*>.*Settings<\/a>/);
    expect(html).toMatch(/<form[^>]*action="\/api\/logout"/);
    expect(html).toMatch(/<button type="submit"[^>]*>.*Sign out<\/button>/);
  });
});
