import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Deps } from "../../../shared/deps";
import { parse } from "../../../http/validation";
import type { RegisterDeviceHandler } from "../application/RegisterDeviceHandler";
import type { UnregisterDeviceHandler } from "../application/UnregisterDeviceHandler";
import type { GetUpdatedSerialsHandler } from "../application/GetUpdatedSerialsHandler";
import type { GetLatestPassHandler } from "../application/GetLatestPassHandler";
import type { LogDeviceDiagnosticsHandler } from "../application/LogDeviceDiagnosticsHandler";

const registerBodySchema = z.object({ pushToken: z.string().min(1) });
const logBodySchema = z.object({ logs: z.array(z.string()) });

export interface DeliveryHandlers {
  registerDevice: RegisterDeviceHandler;
  unregisterDevice: UnregisterDeviceHandler;
  getUpdatedSerials: GetUpdatedSerialsHandler;
  getLatestPass: GetLatestPassHandler;
  logDiagnostics: LogDeviceDiagnosticsHandler;
}

/** Extract the raw token from `Authorization: ApplePass <token>`. */
function extractApplePassToken(header: string | undefined): string | null {
  if (!header) return null;
  const m = /^ApplePass\s+(.+)$/.exec(header);
  return m ? m[1] : null;
}

/** Register all 5 Apple PassKit web-service routes under /wallet/v1. */
export function registerDeliveryRoutes(
  app: FastifyInstance,
  _deps: Deps,
  handlers: DeliveryHandlers,
): void {
  // 9.1  POST /wallet/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeId/:serial
  app.post<{
    Params: {
      deviceLibraryIdentifier: string;
      passTypeIdentifier: string;
      serialNumber: string;
    };
  }>(
    "/wallet/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber",
    async (req, reply) => {
      const authToken = extractApplePassToken(req.headers["authorization"]);
      if (!authToken) return reply.status(401).send();

      const body = parse(registerBodySchema, req.body);
      const r = await handlers.registerDevice.execute({
        deviceLibraryIdentifier: req.params.deviceLibraryIdentifier,
        passTypeIdentifier: req.params.passTypeIdentifier,
        serialNumber: req.params.serialNumber,
        pushToken: body.pushToken,
        authToken,
      });
      if (!r.ok) return reply.status(401).send();
      return reply.status(r.value.status).send();
    },
  );

  // 9.2  GET /wallet/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeId
  app.get<{
    Params: { deviceLibraryIdentifier: string; passTypeIdentifier: string };
    Querystring: { passesUpdatedSince?: string };
  }>(
    "/wallet/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier",
    async (req, reply) => {
      const r = await handlers.getUpdatedSerials.execute({
        deviceLibraryIdentifier: req.params.deviceLibraryIdentifier,
        passTypeIdentifier: req.params.passTypeIdentifier,
        passesUpdatedSince: req.query.passesUpdatedSince,
      });
      if (!r.ok) return reply.status(500).send();
      if (r.value === null) return reply.status(204).send();
      return reply.status(200).send(r.value);
    },
  );

  // 9.3  GET /wallet/v1/passes/:passTypeIdentifier/:serialNumber
  app.get<{ Params: { passTypeIdentifier: string; serialNumber: string } }>(
    "/wallet/v1/passes/:passTypeIdentifier/:serialNumber",
    async (req, reply) => {
      const authToken = extractApplePassToken(req.headers["authorization"]);
      if (!authToken) return reply.status(401).send();

      const r = await handlers.getLatestPass.execute({
        serialNumber: req.params.serialNumber,
        passTypeIdentifier: req.params.passTypeIdentifier,
        authToken,
        ifModifiedSince: req.headers["if-modified-since"],
      });
      if (!r.ok) return reply.status(500).send();

      const result = r.value;
      if (result.status === 401) return reply.status(401).send();
      if (result.status === 304) return reply.status(304).send();

      // status 200
      reply.header("Last-Modified", result.lastModified);
      if (!result.buffer) {
        // S3 cache miss - pass-issuance must (re)sign and cache before we can serve.
        return reply.status(503).send();
      }
      return reply
        .header("Content-Type", "application/vnd.apple.pkpass")
        .status(200)
        .send(result.buffer);
    },
  );

  // 9.4  DELETE /wallet/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeId/:serial
  app.delete<{
    Params: {
      deviceLibraryIdentifier: string;
      passTypeIdentifier: string;
      serialNumber: string;
    };
  }>(
    "/wallet/v1/devices/:deviceLibraryIdentifier/registrations/:passTypeIdentifier/:serialNumber",
    async (req, reply) => {
      const authToken = extractApplePassToken(req.headers["authorization"]);
      if (!authToken) return reply.status(401).send();

      const r = await handlers.unregisterDevice.execute({
        deviceLibraryIdentifier: req.params.deviceLibraryIdentifier,
        passTypeIdentifier: req.params.passTypeIdentifier,
        serialNumber: req.params.serialNumber,
        authToken,
      });
      if (!r.ok) return reply.status(401).send();
      return reply.status(200).send();
    },
  );

  // 9.5  POST /wallet/v1/log  (no auth; always 200)
  app.post("/wallet/v1/log", async (req, reply) => {
    const body = parse(logBodySchema, req.body);
    await handlers.logDiagnostics.execute({ logs: body.logs });
    return reply.status(200).send();
  });
}
