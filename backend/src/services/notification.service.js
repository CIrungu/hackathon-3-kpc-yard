import env from "../config/env.js";

const PAGERDUTY_V2_URL = (url) => (url.includes("events/v2") ? url : `${url}/v2`).replace(/\/+$/, "");

/**
 * Send an operational alert to PagerDuty (Events API v2) and/or Slack.
 * Failures are swallowed and logged — alerting must never break yard logic.
 */
export async function sendAlert(summary, detail, severity = "critical", customDetails = null) {
  const results = { pagerDuty: null, slack: null };
  try {
    if (env.alerts.pagerDutyUrl) {
      await fetch(PAGERDUTY_V2_URL(env.alerts.pagerDutyUrl), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routing_key: env.alerts.pagerDutyUrl.split("/").pop(),
          event_action: "trigger",
          payload: {
            summary,
            source: "kpc-yard-control-plane",
            severity,
            custom_details: { detail, ...(customDetails ? { anomalies: customDetails } : {}) },
          },
        }),
      });
      results.pagerDuty = "sent";
    }
  } catch (err) {
    console.warn("[notification] PagerDuty send failed:", err.message);
    results.pagerDuty = `failed: ${err.message}`;
  }

  try {
    if (env.alerts.slackUrl) {
      await fetch(env.alerts.slackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `:rotating_light: *${summary}*\n${detail}`,
        }),
      });
      results.slack = "sent";
    }
  } catch (err) {
    console.warn("[notification] Slack send failed:", err.message);
    results.slack = `failed: ${err.message}`;
  }

  return results;
}

/**
 * TALK-SASA bulk SMS gateway — sends chauffeur/driver notifications with the
 * token & bay assignment so the driver knows exactly where to stage.
 */
export async function sendSms(phone, message) {
  if (!phone) return { ok: false, reason: "no-phone" };
  if (!env.sms.token || !env.sms.baseUrl || env.nodeEnv === "test") {
    // Demo/emulator mode (and always during test runs): log instead of sending.
    console.log(`[sms:emulated] → ${phone}: ${message}`);
    return { ok: true, emulated: true, to: phone };
  }

  try {
    const baseUrl = String(env.sms.baseUrl).replace(/\/+$/, "");
    const res = await fetch(`${baseUrl}/sms/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.sms.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        recipient: phone,
        sender_id: String(env.sms.senderId ?? "TALK-SASA"),
        type: "plain",
        message,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(JSON.stringify(json));
    return { ok: true, provider: "talksasa", response: json };
  } catch (err) {
    console.warn("[sms] TALK-SASA send failed:", err.message);
    return { ok: false, reason: err.message };
  }
}

export async function notifyDriver({ phone, token, regNo, message, heading = "KPC Yard Control Plane" }) {
  const text = `${heading}\n${message}\nToken: ${token}${regNo ? ` | Reg ${regNo}` : ""}`;
  return sendSms(phone, text);
}

/**
 * Build a web-push ready notification payload for the Driver Mobile UI.
 */
export function pushPayload({ token, title, body, badge = null }) {
  return {
    token,
    title,
    body,
    badge: badge ?? `KPC-${token?.split("-")[1] ?? "MBA"}`,
    timestamp: Date.now(),
  };
}