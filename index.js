/**
 * Cloud Functions for Abdul Rafay's Chat
 * ─────────────────────────────────────────
 * Listens to the Realtime Database and sends FCM push notifications.
 *
 * Rules (locked in with Adnan):
 *   - If the actor's name matches "abdul" OR "rafay" (case + space insensitive),
 *     notify EVERY registered family member (except the actor's own devices).
 *   - Otherwise, notify ONLY Adnan (any name starting with or equal to "adnan"
 *     after lowercasing, e.g. "Adnan", "adnan yusuf", "Adnan B").
 *
 * IMPORTANT: payloads are sent as data-only so the service worker has full
 * control of the displayed notification. This prevents the double-notification
 * bug caused by Firebase's auto-display when a `notification` field is present.
 *
 * Triggers:
 *   - onLogin   : new entry under /login_events/{eventId}    → login push
 *                 (event is auto-deleted after processing)
 *   - onMessage : new key under /messages/{msgId}            → message push
 *
 * Tokens are stored at /fcm_tokens/{userName}/{fcmToken} = true.
 * Invalid tokens are auto-cleaned when FCM rejects them.
 */

const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

admin.initializeApp();

// ─── Name-matching helpers ─────────────────────────────────────────────────

/** Does the name look like Abdul Rafay (any variant)? */
function isAbdulRafay(name) {
  if (!name) return false;
  const norm = String(name).toLowerCase().replace(/\s+/g, "");
  return norm.includes("abdul") || norm.includes("rafay");
}

/**
 * Is the name a variant of Adnan?
 * Matches: "Adnan", "adnan", "Adnan Yusuf", "Adnan B" — anything that begins
 * with "adnan" after lowercasing & trimming.
 */
function isAdnan(name) {
  if (!name) return false;
  return String(name).toLowerCase().trim().startsWith("adnan");
}

/**
 * Should we suppress all pushes when this person is the actor?
 * Per Adnan's request, his own actions never trigger notifications to anyone.
 */
function isMuted(name) {
  return isAdnan(name);
}

// ─── Recipient resolution ──────────────────────────────────────────────────

async function getRecipients(actorName) {
  const snap = await admin.database().ref("fcm_tokens").once("value");
  const all = snap.val() || {};
  const actorIsAR = isAbdulRafay(actorName);
  const actorLower = String(actorName).toLowerCase();
  const recipients = [];

  console.log(
    `Resolving recipients for actor="${actorName}" (isAR=${actorIsAR}). ` +
      `Token holders: [${Object.keys(all).join(", ")}]`
  );

  for (const [user, userTokens] of Object.entries(all)) {
    if (!userTokens || typeof userTokens !== "object") continue;
    const userLower = user.toLowerCase();

    // Skip the actor's own devices
    if (userLower === actorLower) continue;
    // If actor is an Abdul Rafay variant, skip any other AR variants
    if (actorIsAR && isAbdulRafay(user)) continue;

    if (actorIsAR) {
      // Notify everyone else
      Object.keys(userTokens).forEach((token) =>
        recipients.push({ token, user })
      );
    } else {
      // Notify only Adnan
      if (isAdnan(user)) {
        Object.keys(userTokens).forEach((token) =>
          recipients.push({ token, user })
        );
      }
    }
  }

  console.log(
    `Will push to ${recipients.length} token(s) for users: ` +
      `[${recipients.map((r) => r.user).join(", ")}]`
  );
  return recipients;
}

// ─── Sending + token cleanup ───────────────────────────────────────────────

async function sendPushes(actorName, title, body) {
  const recipients = await getRecipients(actorName);
  if (recipients.length === 0) {
    console.log(`No recipients for actor="${actorName}"`);
    return;
  }
  const tokens = recipients.map((r) => r.token);

  // DATA-ONLY payload. The service worker reads this and decides how to display.
  // Strings only — FCM data fields must be strings.
  const response = await admin.messaging().sendEachForMulticast({
    data: {
      title: String(title || "Rafay Chat"),
      body: String(body || ""),
      link: "/chat-app.html",
    },
    tokens,
  });

  // Clean up tokens FCM says are dead
  const removals = [];
  response.responses.forEach((res, i) => {
    if (!res.success) {
      const code = res.error && res.error.code ? res.error.code : "";
      console.log(`Token send failed: ${code} for ${recipients[i].user}`);
      if (
        code.includes("registration-token-not-registered") ||
        code.includes("invalid-registration-token") ||
        code.includes("invalid-argument")
      ) {
        const { token, user } = recipients[i];
        removals.push(
          admin.database().ref(`fcm_tokens/${user}/${token}`).remove()
        );
      }
    }
  });
  await Promise.all(removals);

  console.log(
    `Pushed ${response.successCount}/${tokens.length} for actor="${actorName}"`
  );
}

// ─── Debounce login pushes on reconnect ────────────────────────────────────

async function shouldNotifyLogin(name) {
  const safeName = String(name).replace(/[.#$/\[\]]/g, "_");
  const ref = admin.database().ref(`notification_state/lastLogin/${safeName}`);
  const snap = await ref.once("value");
  const last = snap.val() || 0;
  const now = Date.now();
  if (now - last < 60 * 1000) return false;
  await ref.set(now);
  return true;
}

// ─── Triggers ──────────────────────────────────────────────────────────────

exports.onLogin = functions.database
  .ref("/login_events/{eventId}")
  .onCreate(async (snapshot, context) => {
    const data = snapshot.val();
    const name = data && data.user;
    // Always clean up the event so the collection doesn't grow forever
    const cleanup = snapshot.ref.remove().catch(() => null);

    if (!name) {
      await cleanup;
      return;
    }
    // Adnan's actions never trigger pushes (per his standing request)
    if (isMuted(name)) {
      console.log(`Muted actor ${name} — skipping login push.`);
      await cleanup;
      return;
    }
    if (!(await shouldNotifyLogin(name))) {
      console.log(`Suppressed duplicate login push for ${name}`);
      await cleanup;
      return;
    }
    const title = isAbdulRafay(name)
      ? `${name} is online!`
      : "Someone joined Rafay Chat";
    const body = `${name} just signed in to Rafay Chat.`;
    await sendPushes(name, title, body);
    await cleanup;
  });

exports.onMessage = functions.database
  .ref("/messages/{msgId}")
  .onCreate(async (snapshot, context) => {
    const msg = snapshot.val();
    if (!msg || !msg.user) return;
    // Adnan's messages never trigger pushes (per his standing request)
    if (isMuted(msg.user)) {
      console.log(`Muted actor ${msg.user} — skipping message push.`);
      return;
    }
    const name = msg.user;

    let body = (msg.text || "").trim();
    if (msg.fileType === "image" && !body) body = "📷 Photo";
    else if (msg.fileType === "voice" && !body) body = "🎤 Voice message";
    else if (msg.fileType === "doc" && !body) body = "📄 File";
    if (body.length > 100) body = body.substring(0, 100) + "…";
    if (!body) body = "Sent a message";

    await sendPushes(name, name, body);
  });
