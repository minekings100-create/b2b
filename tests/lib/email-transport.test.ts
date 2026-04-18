import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __setEmailTransportForTests,
  fromAddress,
  getEmailTransport,
  type EmailTransport,
} from "@/lib/email/transport";

describe("email transport", () => {
  beforeEach(() => {
    __setEmailTransportForTests(null);
  });
  afterEach(() => {
    __setEmailTransportForTests(null);
    vi.restoreAllMocks();
  });

  it("returns the console transport by default — no Resend client constructed", async () => {
    const t = getEmailTransport();
    expect(t.name).toBe("console");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const result = await t.send({
      to: "x@example.com",
      subject: "hi",
      html: "<p>hi</p>",
      text: "hi",
      type: "test",
    });
    expect(result.ok).toBe(true);
    expect(logSpy).toHaveBeenCalled();
  });

  it("does not require RESEND_API_KEY to construct", () => {
    const prev = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    expect(() => getEmailTransport()).not.toThrow();
    if (prev !== undefined) process.env.RESEND_API_KEY = prev;
  });

  it("__setEmailTransportForTests swaps the transport", async () => {
    const sent: string[] = [];
    const recording: EmailTransport = {
      name: "recording",
      async send(m) {
        sent.push(`${m.type}:${m.to}`);
        return { ok: true };
      },
    };
    __setEmailTransportForTests(recording);
    await getEmailTransport().send({
      to: "a@x",
      subject: "s",
      html: "h",
      text: "t",
      type: "trigger.x",
    });
    expect(sent).toEqual(["trigger.x:a@x"]);
  });

  it("fromAddress falls back to the Resend sandbox sender when RESEND_FROM_EMAIL is unset", () => {
    const prev = process.env.RESEND_FROM_EMAIL;
    delete process.env.RESEND_FROM_EMAIL;
    expect(fromAddress()).toMatch(/onboarding@resend\.dev/);
    if (prev !== undefined) process.env.RESEND_FROM_EMAIL = prev;
  });
});
