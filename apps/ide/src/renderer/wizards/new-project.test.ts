import { describe, expect, it } from "vitest";
import { defaultTemplate, joinPath, underOneDrive } from "./NewProjectDialog.tsx";

describe("New Project helpers", () => {
  it("joins with the folder's separator", () => {
    expect(joinPath("C:\\Users\\me\\DSDudeProjects\\", "my_game")).toBe("C:\\Users\\me\\DSDudeProjects\\my_game");
    expect(joinPath("/home/me/p", "g")).toBe("/home/me/p/g");
  });

  it("warns only inside a OneDrive folder", () => {
    const od = ["C:\\Users\\me\\OneDrive"];
    expect(underOneDrive("c:/users/me/onedrive/Desktop", od)).toBe(true);
    expect(underOneDrive("C:\\Users\\me\\OneDrive", od)).toBe(true);
    expect(underOneDrive("C:\\Users\\me\\OneDriveOther", od)).toBe(false);
    expect(underOneDrive("C:\\Users\\me\\DSDudeProjects", od)).toBe(false);
    expect(underOneDrive("C:\\x", [""])).toBe(false);
  });

  it("picks Flappy Bird first when it is listed", () => {
    const t = (id: string, title = id) => ({ id, title, description: "" });
    expect(defaultTemplate([t("empty"), t("flappy", "Flappy Bird")])).toBe("flappy");
    expect(defaultTemplate([t("empty"), t("sample-flappy", "Flappy")])).toBe("sample-flappy");
    expect(defaultTemplate([t("empty")])).toBe("empty");
    expect(defaultTemplate([])).toBeNull();
  });
});
