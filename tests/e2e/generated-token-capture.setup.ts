import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { decryptEnvelope, keyedHash } from "../../src/server/security/crypto";
import {
  registerPasswordUser,
  requestPasswordReset,
  verifyEmailToken,
} from "../../src/server/identity/service";

export default async function generatedTokenCaptureSetup() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
      ?? "postgres://nexaflow:nexaflow@127.0.0.1:54329/nexaflow",
  });
  const secret = "framework-outbox-capture-secret-32-characters";
  const config = {
    secret,
    appOrigin: "http://127.0.0.1:3100",
    idleMinutes: 30,
    absoluteHours: 24,
    touchIntervalSeconds: 60,
  };
  const marker = randomUUID();
  const email = `framework-capture-${marker}@example.test`;
  const risk = `framework-capture-${marker}`;
  let userId = "";
  let verificationToken = "";

  const generatedLink = async (topic: string) => {
    const result = await pool.query<{ payload: { envelope: string } }>(
      `select payload from outbox_messages
       where topic = $1 and aggregate_id = $2
       order by created_at desc limit 1`,
      [topic, userId],
    );
    if (!result.rows[0]) throw new Error("generated_capture_outbox_missing");
    const message = decryptEnvelope<{ text: string }>(result.rows[0].payload.envelope, secret);
    const start = message.text.indexOf("http");
    if (start < 0) throw new Error("generated_capture_link_missing");
    return new URL(message.text.slice(start));
  };

  try {
    await registerPasswordUser(pool, {
      email,
      displayName: "Framework Capture",
      password: "Framework-capture-123!",
      riskKey: risk,
    }, config);
    const user = await pool.query<{ id: string }>(
      "select id from users where primary_email_normalized = $1",
      [email],
    );
    userId = user.rows[0]?.id ?? "";
    if (!userId) throw new Error("generated_capture_user_missing");

    const verification = await generatedLink("identity.email_verification");
    verificationToken = verification.searchParams.get("token") ?? "";
    if (!verificationToken) throw new Error("generated_capture_verification_token_missing");
    process.env.FRAMEWORK_CAPTURE_VERIFICATION_LINK = verification.toString();

    const verified = await verifyEmailToken(
      pool,
      verificationToken,
      config,
      `${risk}-verify`,
    );
    if (!verified.ok) throw new Error("generated_capture_verification_fixture_failed");
    await requestPasswordReset(pool, email, `${risk}-reset`, config);
    process.env.FRAMEWORK_CAPTURE_RESET_LINK = (
      await generatedLink("identity.password_reset")
    ).toString();
  } catch (error) {
    await pool.end();
    throw error;
  }

  return async () => {
    try {
      await pool.query("begin");
      await pool.query(
        "delete from audit_events where actor_user_id = $1 or target_id = $1",
        [userId],
      );
      await pool.query("delete from outbox_messages where aggregate_id = $1", [userId]);
      await pool.query("delete from users where id = $1", [userId]);
      const hashes = [
        `network:${risk}`,
        email,
        `network:${risk}-verify`,
        verificationToken.slice(0, 16),
        `network:${risk}-reset`,
      ].map((value) => keyedHash(value, secret));
      await pool.query(
        "delete from rate_limit_windows where risk_key_hash = any($1::text[])",
        [hashes],
      );
      await pool.query("commit");
    } catch (error) {
      await pool.query("rollback");
      throw error;
    } finally {
      await pool.end();
    }
  };
}
