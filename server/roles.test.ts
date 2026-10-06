import { describe, expect, it } from "vitest";
import { getRoleNavigation, isTeacherView } from "../shared/roles";

describe("role-aware navigation", () => {
  it("keeps active student destinations and hides the group door", () => {
    expect(getRoleNavigation("student").map(item => item.label)).toEqual(["الرئيسية", "التقويم", "المراجعة والإتقان", "خريطة الإتقان", "مساعد أدوم"]);
    expect(isTeacherView("student", "teacher")).toBe(false);
  });

  it("keeps teacher management implementation out of primary navigation", () => {
    expect(getRoleNavigation("teacher").map(item => item.label)).toEqual(["لوحة المتابعة", "تقدم المتعلمين"]);
    expect(isTeacherView("teacher", "teacher")).toBe(true);
  });
});
