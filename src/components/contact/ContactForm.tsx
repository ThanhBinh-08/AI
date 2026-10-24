"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string; fields: Record<string, string> };

const TOPIC_LABELS = [
  ["deal-not-working", "A deal or code does not work"],
  ["wrong-information", "Information is wrong or out of date"],
  ["other", "Something else"],
] as const;

export function ContactForm() {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [startedAt] = useState(() => Date.now());
  const fields = status.kind === "error" ? status.fields : {};

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setStatus({ kind: "sending" });
    try {
      const res = await fetch("/api/contact/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: String(form.get("name") ?? ""),
          email: String(form.get("email") ?? ""),
          topic: String(form.get("topic") ?? ""),
          message: String(form.get("message") ?? ""),
          website: String(form.get("website") ?? ""),
          startedAt,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; fields?: Record<string, string> };
      if (res.ok && body.ok) setStatus({ kind: "sent" });
      else setStatus({ kind: "error", message: body.error ?? "Your message could not be sent. Please try again later.", fields: body.fields ?? {} });
    } catch {
      setStatus({ kind: "error", message: "No connection. Check your network and try again.", fields: {} });
    }
  }

  if (status.kind === "sent") {
    return (
      <div className="panel" role="status">
        <p className="subhead-s">Message sent</p>
        <p className="muted">We received your message and will reply to the email address you gave.</p>
      </div>
    );
  }

  const err = (name: string) =>
    fields[name] ? (
      <span className="field-error" id={`${name}-error`}>
        {fields[name]}
      </span>
    ) : null;

  return (
    <form className="panel" onSubmit={onSubmit} noValidate style={{ display: "grid", gap: 18 }}>
      <div className="field">
        <label htmlFor="c-name">Name</label>
        <input id="c-name" name="name" className="input" required maxLength={100} autoComplete="name" aria-invalid={Boolean(fields.name)} aria-describedby={fields.name ? "name-error" : undefined} />
        {err("name")}
      </div>
      <div className="field">
        <label htmlFor="c-email">Email</label>
        <input id="c-email" name="email" type="email" className="input" required maxLength={200} autoComplete="email" aria-invalid={Boolean(fields.email)} aria-describedby={fields.email ? "email-error" : undefined} />
        {err("email")}
      </div>
      <div className="field">
        <label htmlFor="c-topic">Topic</label>
        <select id="c-topic" name="topic" className="select" defaultValue="deal-not-working" aria-invalid={Boolean(fields.topic)}>
          {TOPIC_LABELS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {err("topic")}
      </div>
      <div className="field">
        <label htmlFor="c-message">Message</label>
        <textarea id="c-message" name="message" className="textarea" required minLength={10} maxLength={5000} aria-invalid={Boolean(fields.message)} aria-describedby={fields.message ? "message-error" : "message-hint"} />
        {err("message") ?? (
          <span className="field-hint" id="message-hint">
            For a deal, include the brand and the code.
          </span>
        )}
      </div>
      {/* Honeypot: hidden from people and screen readers. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
        <label htmlFor="c-website">Website</label>
        <input id="c-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {status.kind === "error" ? (
        <p className="field-error" role="alert">
          {status.message}
        </p>
      ) : null}
      <div>
        <button type="submit" className="btn btn-primary" disabled={status.kind === "sending"} aria-busy={status.kind === "sending"}>
          {status.kind === "sending" ? "Sending…" : "Send message"}
        </button>
      </div>
      <p className="field-hint">
        We use your details only to reply. See the <Link href="/privacy-policy/">privacy policy</Link>.
      </p>
    </form>
  );
}
