const express = require("express");
const crypto = require("crypto");
const { CTraderConnection } = require("@reiryoku/ctrader-layer");
const ctraderClient = require("./ctraderClient");

const router = express.Router();
const userSessions = new Map();

function buildAuthUrl() {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.CTRADER_CLIENT_ID,
    redirect_uri: process.env.CTRADER_REDIRECT_URI,
    scope: "trading",
  });
  return `https://connect.spotware.com/apps/auth?${params.toString()}`;
}

router.get("/auth/login", (req, res) => {
  res.redirect(buildAuthUrl());
});

router.get("/auth/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("Missing authorization code");

  try {
    const tokenRes = await fetch("https://connect.spotware.com/apps/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.CTRADER_REDIRECT_URI,
        client_id: process.env.CTRADER_CLIENT_ID,
        client_secret: process.env.CTRADER_CLIENT_SECRET,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error("Token exchange failed:", tokenData);
      return res.status(400).json(tokenData);
    }

    const accounts = await CTraderConnection.getAccessTokenAccounts(tokenData.access_token);

    const sessionId = crypto.randomUUID();
    userSessions.set(sessionId, {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      accounts,
    });

    res.cookie("session_id", sessionId, { httpOnly: true, sameSite: "lax" });
    res.redirect("/index.html?connected=1");
  } catch (err) {
    console.error(err);
    res.status(500).send("OAuth callback failed");
  }
});

router.post("/auth/select-account", async (req, res) => {
  const sessionId = req.cookies.session_id;
  const session = userSessions.get(sessionId);
  if (!session) return res.status(401).json({ error: "Not logged in" });

  const { ctidTraderAccountId } = req.body;
  try {
    await ctraderClient.authorizeAccount(ctidTraderAccountId, session.accessToken);
    res.json({ ok: true, ctidTraderAccountId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/auth/session", (req, res) => {
  const sessionId = req.cookies.session_id;
  const session = userSessions.get(sessionId);
  if (!session) return res.status(401).json({ error: "Not logged in" });
  res.json({ accounts: session.accounts });
});

module.exports = { router, userSessions };