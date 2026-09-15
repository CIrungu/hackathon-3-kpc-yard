import { useEffect, useRef } from "react";
import { API_BASE } from "../services/api.js";

/**
 * Live Server-Sent Events stream from the backend control plane.
 * Subscribes handlers to named domain events (gate:entry, anomaly:detected,
 * reroute:applied, queue:sequenced, ...).
 */
export function useYardStream(handlers = {}) {
  const handlerRef = useRef(handlers);
  handlerRef.current = handlers;

  const lastEvents = useRef([]);

  useEffect(() => {
    const source = new EventSource(`${API_BASE}/stream`);
    const generic = (evt) => {
      try {
        const message = JSON.parse(evt.data);
        lastEvents.current = [...lastEvents.current.slice(-39), message];
        const fn = handlerRef.current[message.event] ?? handlerRef.current.all;
        fn?.(message);
      } catch {
        /* malformed frame */
      }
    };

    for (const evt of ["gate:entry", "bay:assigned", "loading:started", "loading:progress", "loading:completed", "checkpoint:crossed", "anomaly:detected", "reroute:applied", "queue:sequenced", "control:override", "sla:breach", "preMovement:alert", "compliance:violation", "truck:exited"]) {
      source.addEventListener(evt, generic);
    }
    source.addEventListener("message", generic);
    return () => source.close();
  }, []);

  return lastEvents;
}

export { useYardStream as default };