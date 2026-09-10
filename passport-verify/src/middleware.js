/**
 * Express / Connect-style middleware factory.
 *
 *   app.post("/book",
 *     passportGate(verifier, { action: "BOOK_TRAVEL", getAmountWei: (req) => req.body.amountWei }),
 *     (req, res) => { ... req.agent is the verified agent address ... });
 *
 * The signed envelope can travel in the JSON body (default) or in headers:
 *   x-passport-request: <json of signed fields>
 *   x-passport-signature: 0x...
 */
export function passportGate(verifier, { action, getAmountWei } = {}) {
  return async function gate(req, res, next) {
    try {
      const request = extractRequest(req);
      if (!request) return deny(res, "missing passport request envelope");

      const result = await verifier.verify(request, {
        action,
        amountWei: getAmountWei ? getAmountWei(req) : undefined,
      });
      if (!result.ok) return deny(res, result.reason);

      req.agent = result.agent;
      req.passportId = BigInt(request.passportId);
      next();
    } catch (err) {
      deny(res, `verification error: ${err.message}`);
    }
  };
}

function extractRequest(req) {
  if (req.body && req.body.signature) return req.body;
  const raw = req.headers["x-passport-request"];
  const sig = req.headers["x-passport-signature"];
  if (raw && sig) return { ...JSON.parse(raw), signature: sig };
  return null;
}

function deny(res, reason) {
  res.status(403).json({ status: "denied", reason });
}
