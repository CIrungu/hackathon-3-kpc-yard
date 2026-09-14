import { processGateEntry, listManifest } from "../services/yard.service.js";
import { notifyDriver } from "../services/notification.service.js";
import { pushPayload } from "../services/notification.service.js";

export async function anprEntry(req, res, next) {
  try {
    const result = await processGateEntry({
      regNo: req.body.regNo,
      depot: req.body.depot ?? "MBA",
      driverName: req.body.driverName,
      driverPhone: req.body.driverPhone,
      operatorId: req.user.id,
    });

    // Push a welcome mobile notification to the driver
    if (req.body.driverPhone) {
      const push = pushPayload({
        token: result.token,
        title: result.manifestVerified ? "Token issued ✅" : "Token issued — verification pending",
        body: result.message,
      });
      await notifyDriver({
        phone: req.body.driverPhone,
        token: result.token,
        regNo: result.truck.regNo,
        message: result.message,
      });
      result.pushNotification = push;
    }

    return res.status(201).json({ success: true, data: result });
  } catch (err) {
    return next(err);
  }
}

export async function manifest(req, res, next) {
  try {
    const data = await listManifest();
    return res.json({ success: true, data });
  } catch (err) {
    return next(err);
  }
}