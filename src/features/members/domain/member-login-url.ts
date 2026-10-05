import type { AppSettings } from "../../../shared/domain/models.js";

const webOrigins: Record<AppSettings["environment"], string> = {
  development: "http://localhost:5173",
  staging: "https://tnp-getgo-stg.web.app",
  production: "https://tnp-getgo.web.app",
};

export function memberLoginUrl(environment: AppSettings["environment"], email: string): string {
  const url = new URL("/auth/login", webOrigins[environment]);
  url.searchParams.set("app", "getgo");
  url.searchParams.set("returnUrl", "/parent/home");
  url.searchParams.set("username", email.trim());
  return url.toString();
}
