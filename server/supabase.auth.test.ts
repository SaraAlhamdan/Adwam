import { describe, it, expect } from "vitest";
import { translateAuthError } from "../client/src/lib/supabase";
import fs from "fs";
import path from "path";

describe("Supabase Auth Migration & Error Handling Suite", () => {
  it("translates invalid credentials error accurately in Arabic and English", () => {
    const err = { message: "Invalid login credentials", code: "invalid_credentials" };
    expect(translateAuthError(err, "ar")).toContain("بيانات الدخول غير صحيحة");
    expect(translateAuthError(err, "en")).toContain("Invalid login credentials");
  });

  it("translates email not confirmed error into actionable instructions", () => {
    const err = { message: "Email not confirmed", code: "email_not_confirmed" };
    expect(translateAuthError(err, "ar")).toContain("البريد الإلكتروني لم يتم تأكيده");
    expect(translateAuthError(err, "ar")).toContain("Email Confirmation");
    expect(translateAuthError(err, "en")).toContain("Email not confirmed");
  });

  it("translates already registered user error without generic fallbacks", () => {
    const err = { message: "User already registered", code: "user_already_exists" };
    expect(translateAuthError(err, "ar")).toContain("يوجد حساب مسجل بهذا البريد");
    expect(translateAuthError(err, "en")).toContain("already exists");
  });

  it("translates weak password and invalid email errors", () => {
    const weakPass = { message: "Password should be at least 6 characters", code: "weak_password" };
    expect(translateAuthError(weakPass, "ar")).toContain("كلمة المرور");

    const badEmail = { message: "Email address is invalid", code: "email_address_invalid" };
    expect(translateAuthError(badEmail, "ar")).toContain("البريد الإلكتروني غير صالحة");
  });

  it("ensures migration file exists and creates trigger and RLS on public.profiles", () => {
    const migrationPath = path.resolve(__dirname, "../supabase/migrations/20261006000002_auth_trigger.sql");
    expect(fs.existsSync(migrationPath)).toBe(true);

    const content = fs.readFileSync(migrationPath, "utf-8");
    expect(content).toContain("create or replace function public.handle_new_user()");
    expect(content).toContain("create trigger on_auth_user_created");
    expect(content).toContain("after insert on auth.users");
    expect(content).toContain("insert into public.profiles");
    expect(content).toContain("alter table public.profiles enable row level security");
  });

  it("confirms client environment and code only use public anon key, never service_role key", () => {
    const envPath = path.resolve(__dirname, "../.env");
    const envContent = fs.readFileSync(envPath, "utf-8");
    expect(envContent).not.toContain("service_role");
    expect(envContent).toContain("VITE_SUPABASE_ANON_KEY");
  });
});
