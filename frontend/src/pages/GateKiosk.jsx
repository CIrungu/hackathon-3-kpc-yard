import { useState, useEffect, useMemo } from "react";
import {
  Camera,
  QrCode,
  ScanLine,
  ArrowRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Volume2,
  VolumeX,
  Fuel,
  Send,
  Sparkles,
  Radio,
  AlertTriangle,
  Wrench,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { useDemoAuth } from "../hooks/useDemoAuth.js";
import { useYardStream } from "../hooks/useYardStream.js";
import { yardApi } from "../services/api.js";
import { speak, speakAlert } from "../services/speech.js";
import StatusBadge from "../components/StatusBadge.jsx";
import { pushAlert } from "../components/AlertCenter.jsx";

const MANIFEST_PLATES = [
  "KDX 100X",
  "KDX 110X",
  "KCA 123X",
  "KDB 456Y",
  "KEC 789Z",
  "KFD 321A",
  "KGE 654B",
  "KHF 987C",
  "KJG 246D",
  "KKH 135E",
  "KMJ 864F",
  "KNK 753G",
  "KDD 001D",
];

// KDD 001D is assigned Staging Yard 2 (not a gantry directly).
const YARD2_TRUCK = "KDD 001D";

const rnd = (chars) => chars[Math.floor(Math.random() * chars.length)];

function PlateReadout({ text, locked, status, conf }) {
  const raw = (text || "").padEnd(8, "·").slice(0, 8).split("");
  return (
    <div className="absolute bottom-[15%] left-1/2 z-10 -translate-x-1/2 w-fit">
      <div
        className={`rounded-md px-3 py-1.5 font-mono text-sm font-bold tracking-[0.4em] transition-all duration-300 ${
          status === "ok"
            ? "bg-emerald-400 text-emerald-950 shadow-[0_0_22px_rgba(16,185,129,0.65)]"
            : status === "no"
              ? "bg-red-500 text-red-950"
              : "bg-white/95 text-slate-900"
        }`}
      >
        {raw.map((c, i) => {
          if (c === "·")
            return (
              <span key={i} className="opacity-30">
                ·
              </span>
            );
          if (status === "ok" || status === "no") return <span key={i}>{c}</span>;
          if (i < locked)
            return (
              <span key={i} className="text-kpc-green">
                {c}
              </span>
            );
          return (
            <span key={i}>
              {i % 2 ? rnd("1234567890") : rnd("ABCDEFGHJKMNPQRSTUVWXZ")}
            </span>
          );
        })}
      </div>
      <div className="mt-1 text-center font-mono text-[9px] tracking-widest text-white/50">
        {status === "ok" ? `READ OK · ${conf}% CONF` : status === "no" ? "NO READ" : "READING…"}
      </div>
    </div>
  );
}

function OcrReticle({ active, confirmed }) {
  const tone = confirmed ? "border-emerald-400" : active ? "border-amber-300" : "border-white/20";
  return (
    <div
      className={`pointer-events-none absolute inset-x-[18%] top-[30%] bottom-[12%] z-[6] rounded-lg border-2 ${tone} transition-colors duration-300 ${
        active ? "animate-pulse" : "opacity-30"
      }`}
    >
      <span className="absolute -top-2.5 left-2 rounded bg-black/70 px-1.5 font-mono text-[9px] tracking-widest text-white/80">
        OCR-{confirmed ? "LOCKED" : "TRACKING"}
      </span>
      <span className="absolute -top-2.5 right-2 font-mono text-[9px] text-white/60">
        {confirmed ? "✓ 100%" : "23.4 fps"}
      </span>
    </div>
  );
}

// Load persisted state across dashboard switches
function loadSavedKioskState() {
  try {
    const raw = localStorage.getItem("kpc_gate_kiosk_state");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function loadSavedKioskHistory() {
  try {
    const raw = localStorage.getItem("kpc_gate_kiosk_history");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export default function GateKiosk() {
  const auth = useDemoAuth("gate-officer", "Gate Operator");
  const savedState = useMemo(() => loadSavedKioskState(), []);
  
  const [regNo, setRegNo] = useState(savedState.regNo || "");
  const [plate, setPlate] = useState(savedState.plate || null);
  const [entry, setEntry] = useState(savedState.entry || null);
  const [busy, setBusy] = useState(false);
  const [scanResult, setScanResult] = useState(savedState.scanResult || null);
  const [voiceOn, setVoiceOn] = useState(() => localStorage.getItem("kpc_voice_enabled") !== "off");
  const [smsPhone, setSmsPhone] = useState(savedState.smsPhone || "");
  const [smsResult, setSmsResult] = useState(savedState.smsResult || null);
  const [weightResult, setWeightResult] = useState(savedState.weightResult || null);

  // Gantry filled & exit states
  const [gantryStatus, setGantryStatus] = useState(savedState.gantryStatus || "IDLE"); // IDLE | LOADING | FILLED | EXITED
  const [spokenMessage, setSpokenMessage] = useState(savedState.spokenMessage || null);
  const [exitDetection, setExitDetection] = useState(savedState.exitDetection || null);
  const [countdown, setCountdown] = useState(null);
  const [stalledAlert, setStalledAlert] = useState(savedState.stalledAlert || null);

  // Yard 2 Staging state for KDD 001D
  const [yard2Assigned, setYard2Assigned] = useState(savedState.yard2Assigned || false);
  const [yard2DriverAlerted, setYard2DriverAlerted] = useState(savedState.yard2DriverAlerted || false);
  const [yard2StalledFired, setYard2StalledFired] = useState(savedState.yard2StalledFired || false);
  const [yard2PreAlertCountdown, setYard2PreAlertCountdown] = useState(null); // seconds until 5-min pre-alert fires
  const [yard2StalledCountdown, setYard2StalledCountdown] = useState(null); // seconds until 3-min breakdown fires

  const [scanHistory, setScanHistory] = useState(() => loadSavedKioskHistory());

  const [driveTick, setDriveTick] = useState(0);
  const [recording, setRecording] = useState(false);
  const [lockedChars, setLockedChars] = useState(0);
  const [readInfo, setReadInfo] = useState(savedState.readInfo || null);
  const [phase, setPhase] = useState(savedState.phase || "idle");
  const [now, setNow] = useState(() => new Date());

  // Save kiosk state to localStorage for persistence across tab switches
  useEffect(() => {
    try {
      const snapshot = {
        regNo,
        plate,
        entry,
        scanResult,
        smsPhone,
        smsResult,
        weightResult,
        gantryStatus,
        spokenMessage,
        exitDetection,
        readInfo,
        phase,
        stalledAlert,
        yard2Assigned,
        yard2DriverAlerted,
        yard2StalledFired,
      };
      localStorage.setItem("kpc_gate_kiosk_state", JSON.stringify(snapshot));
    } catch {
      /* ignore */
    }
  }, [regNo, plate, entry, scanResult, smsPhone, smsResult, weightResult, gantryStatus, spokenMessage, exitDetection, readInfo, phase, stalledAlert, yard2Assigned, yard2DriverAlerted, yard2StalledFired]);

  // Save history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("kpc_gate_kiosk_history", JSON.stringify(scanHistory));
    } catch {
      /* ignore */
    }
  }, [scanHistory]);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      handleGantryFilledAndExit();
      return;
    }
    const timer = setTimeout(() => {
      setCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // Yard 2 pre-alert countdown (5 minutes = 300s, demo: 15s)
  useEffect(() => {
    if (yard2PreAlertCountdown === null) return;
    if (yard2PreAlertCountdown <= 0) {
      setYard2PreAlertCountdown(null);
      if (!yard2DriverAlerted) {
        setYard2DriverAlerted(true);
        const driverName = entry?.truck?.driverName ?? "Driver";
        const preMsg = `Attention ${driverName}! Your vehicle KDD 001D is staged in Yard 2. ` +
          `Gantry G2 will be available in approximately 3 minutes. ` +
          `Please prepare to move to Gantry 2 when directed.`;
        setSpokenMessage(preMsg);
        speak(preMsg);
        pushAlert({ tone: "warning", title: "⏰ Yard 2 Pre-Alert — Driver Notification", message: `KDD 001D: Gantry G2 ready in ~3 min` });
        // Start 3-minute stalled countdown (demo: 18s)
        setYard2StalledCountdown(18);
      }
      return;
    }
    const t = setTimeout(() => setYard2PreAlertCountdown((p) => (p !== null ? p - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [yard2PreAlertCountdown, yard2DriverAlerted, entry]);

  // Yard 2 stalled countdown (3 minutes after pre-alert, demo: 18s)
  useEffect(() => {
    if (yard2StalledCountdown === null) return;
    if (yard2StalledCountdown <= 0) {
      setYard2StalledCountdown(null);
      if (!yard2StalledFired) {
        setYard2StalledFired(true);
        // Auto-trigger breakdown alert
        triggerYard2BreakdownAlert();
      }
      return;
    }
    const t = setTimeout(() => setYard2StalledCountdown((p) => (p !== null ? p - 1 : null)), 1000);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yard2StalledCountdown, yard2StalledFired]);

  useYardStream({
    "loading:completed": (m) => {
      if (entry && (m.payload.truckId === entry.truck.id || m.payload.regNo === entry.truck.regNo)) {
        setGantryStatus("FILLED");
        const msg = `Gantry filled! Vehicle ${m.payload.regNo} has completed fuel loading at bay ${m.payload.bayId}. Please proceed to the exit ANPR camera.`;
        setSpokenMessage(msg);
        speak(msg);
        pushAlert({
          tone: "success",
          title: "Gantry Filled",
          message: `${m.payload.regNo} @ ${m.payload.bayId} — 100% loaded.`,
        });
      }
    },
    "GANTRY_TANKER_EXITED": (m) => {
      if (entry && (m.payload.tankerId === entry.truck.id || m.payload.numberPlate === entry.truck.regNo)) {
        setGantryStatus("EXITED");
        setExitDetection(m.payload);
        setCountdown(null);
        const msg = `Thank you for your visit! Vehicle ${m.payload.numberPlate}. Your loading process has been completed and your departure has been recorded. Welcome again another day. Drive safely!`;
        setSpokenMessage(msg);
        speak(msg);
        pushAlert({
          tone: "success",
          title: "Departure Voice Broadcast",
          message: `${m.payload.numberPlate} departed — bay released.`,
        });
      }
    },
  });

  const decodeTarget = (regNo.trim() || plate || "").toUpperCase();

  function handleResetForm() {
    setRegNo("");
    setPlate(null);
    setEntry(null);
    setScanResult(null);
    setSmsResult(null);
    setWeightResult(null);
    setGantryStatus("IDLE");
    setSpokenMessage(null);
    setExitDetection(null);
    setReadInfo(null);
    setPhase("idle");
    setStalledAlert(null);
    setYard2Assigned(false);
    setYard2DriverAlerted(false);
    setYard2StalledFired(false);
    setYard2PreAlertCountdown(null);
    setYard2StalledCountdown(null);
    localStorage.removeItem("kpc_gate_kiosk_state");
  }

  // Auto-trigger breakdown alert for Yard 2 KDD 001D
  async function triggerYard2BreakdownAlert() {
    const bayId = "YARD-2";
    try {
      const data = await yardApi.reportStalledTruck({
        truckId: entry?.truck?.id || null,
        bayId,
        reason: "YARD2_STALLED_NO_MOVEMENT_3MIN",
      }).catch(() => ({
        regNo: "KDD 001D",
        bayId,
        voiceAnnouncement: "Attention Response Team! Vehicle KDD 001D has been stationary in Staging Yard 2 for over 3 minutes without moving to Gantry G2. Please dispatch a team to Yard 2 immediately to investigate a possible mechanical breakdown. Alternate vehicle has been queued to Gantry G2.",
        reallocatedRegNo: "KMJ 864F",
        truckId: null,
      }));
      setStalledAlert(data);
      speakAlert(data.voiceAnnouncement);
      pushAlert({
        tone: "error",
        title: "🚨 Yard 2 Breakdown Alert — Response Team Dispatched",
        message: `KDD 001D stalled in Yard 2. Alternate: ${data.reallocatedRegNo ?? "queued"}`,
      });
    } catch (err) {
      pushAlert({ tone: "error", title: "Yard 2 Breakdown Error", message: err.message });
    }
  }

  async function triggerStalledVehicleAlert() {
    const currentPlate = entry?.truck?.regNo || regNo.trim() || "KMJ 864F";
    const currentBay = scanResult?.allocation?.assignment?.bayId || entry?.truck?.bayId || "G2";
    setBusy(true);

    try {
      const data = await yardApi.reportStalledTruck({
        truckId: entry?.truck?.id || null,
        bayId: currentBay,
        reason: "MECHANICAL_BREAKDOWN_3MIN_TIMEOUT",
      });

      setStalledAlert(data);
      speakAlert(data.voiceAnnouncement);

      pushAlert({
        tone: "error",
        title: "🚨 Response Team Dispatched (Yard Mechanical Breakdown)",
        message: `${data.regNo} stalled en route to ${data.bayId}. Bay reallocated${data.reallocatedRegNo ? ` to ${data.reallocatedRegNo}` : ""}.`,
      });
    } catch (err) {
      pushAlert({ tone: "error", title: "Breakdown Alert Error", message: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function resolveStalledVehicle() {
    if (!stalledAlert?.truckId) return;
    setBusy(true);
    try {
      await yardApi.resolveStalledTruck(stalledAlert.truckId);
      setStalledAlert(null);
      speak("Response team confirmed vehicle repair complete. Truck re-queued into yard control plane.");
      pushAlert({ tone: "success", title: "Vehicle Repaired", message: `${stalledAlert.regNo} re-queued.` });
    } catch (err) {
      pushAlert({ tone: "error", title: "Resolution Error", message: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function capture() {
    if (!regNo.trim()) return;
    const target = regNo.trim().toUpperCase();
    setBusy(true);
    setRecording(true);
    setLockedChars(0);
    setReadInfo(null);
    setScanResult(null);
    setEntry(null);
    setPlate(null);
    setGantryStatus("IDLE");
    setCountdown(null);
    setSpokenMessage(null);
    setExitDetection(null);
    setStalledAlert(null);
    setPhase("scanning");
    setDriveTick((t) => t + 1);
    setSmsResult(null);
    setWeightResult(null);

    const iv = setInterval(() => setLockedChars((n) => Math.min(n + 1, target.length)), 220);
    try {
      const result = await yardApi.gateEntry({ regNo: target, depot: "MBA" });
      setEntry(result);
      setSmsPhone(result.truck.driverPhone ?? "");
      setPlate(result.truck.regNo);
      localStorage.setItem("kpc_latest_token", result.token);
      setReadInfo({ ok: true, conf: 94 + Math.floor(Math.random() * 5) });
      setPhase("confirmed");

      // Append to scan history
      setScanHistory((prev) => [
        {
          token: result.token,
          regNo: result.truck.regNo,
          time: new Date().toLocaleTimeString(),
          driverName: result.truck.driverName,
          verified: result.manifestVerified,
        },
        ...prev.filter((h) => h.token !== result.token).slice(0, 9),
      ]);

      const msg = `Vehicle ${result.truck.regNo} verified against manifest. Token ${result.token}. Please proceed to the weigh bridge.`;
      setSpokenMessage(msg);
      speak(msg);
      pushAlert({
        tone: result.manifestVerified ? "success" : "warning",
        title: "ANPR Match Confirmed",
        message: `${result.token} — ${result.truck.regNo}`,
      });
    } catch (err) {
      setReadInfo({ ok: false });
      setPhase("rejected");
      speak(`Unable to verify plate ${target}. ${err.message}`);
      pushAlert({ tone: "error", title: "Gate Capture Failed", message: err.message });
    } finally {
      clearInterval(iv);
      setLockedChars(target.length);
      setRecording(false);
      setBusy(false);
    }
  }

  async function runCheckpoint(checkpoint) {
    if (!entry) return;
    setBusy(true);
    const isKdd001d = (entry.truck.regNo || "").toUpperCase().trim() === YARD2_TRUCK;
    try {
      const checkpointPayload = { token: entry.truck.token, checkpoint };
      if (checkpoint === "WEIGHBRIDGE" && entry.truck.expectedGrossWeightKg) {
        const jitter = 1 + (Math.random() - 0.5) * 0.008;
        checkpointPayload.payload = { grossWeightKg: Math.round(entry.truck.expectedGrossWeightKg * jitter) };
      }
      const result = await yardApi.scanCheckpoint(checkpointPayload);
      setScanResult(result);
      if (result.weight) setWeightResult(result.weight);

      // Special flow: KDD 001D at weighbridge → Staging Yard 2
      if (checkpoint === "WEIGHBRIDGE" && isKdd001d) {
        const yard2Msg = `Weighbridge verified. Vehicle KDD 001D, weight is within tolerance. ` +
          `You have been assigned to Staging Yard 2. Please proceed to Yard 2 and await further instructions. ` +
          `You will be notified when Gantry 2 becomes available.`;
        setSpokenMessage(yard2Msg);
        speak(yard2Msg);
        setYard2Assigned(true);
        setYard2DriverAlerted(false);
        setYard2StalledFired(false);
        // Start 5-min pre-alert countdown (demo: 15 seconds)
        setYard2PreAlertCountdown(15);
        pushAlert({
          tone: "warning",
          title: "⚡ Staging Yard 2 Assigned — KDD 001D",
          message: "KDD 001D → Staging Yard 2. Gantry G2 in ~5 min. Driver pre-alert active.",
        });
        return;
      }

      if (result.allocation) {
        const { assignment } = result.allocation;
        const msg = `Bay ${assignment.bayId} assigned. Estimated wait ${assignment.etaMinutes} minutes. Please proceed to gantry ${assignment.bayId.replace(/^G/i, "")}.`;
        setSpokenMessage(msg);
        speak(msg);
        pushAlert({
          tone: "success",
          title: "AI Bay Assigned",
          message: `${entry.truck.regNo} → ${assignment.bayId} (ETA ~${assignment.etaMinutes} min)`,
        });
      } else {
        const msg = `Checkpoint ${checkpoint} verified. Continue forward.`;
        setSpokenMessage(msg);
        speak(msg);
        pushAlert({
          tone: checkpoint === "WEIGHBRIDGE" ? "warning" : "success",
          title: `RFID @ ${checkpoint}`,
          message: `${entry.truck.token}`,
        });
      }
    } catch (err) {
      speak(`Scanner error at ${checkpoint}. ${err.message}`);
      pushAlert({ tone: "error", title: "Scanner Error", message: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function handleStartLoading(withTimer = false, duration = 30) {
    if (!entry) return;
    const assignedBayId = scanResult?.allocation?.assignment?.bayId ?? entry.truck.bayId ?? "B03";
    setBusy(true);
    try {
      await yardApi.startLoading(entry.truck.id, assignedBayId);
      setGantryStatus("LOADING");
      if (withTimer) {
        setCountdown(duration);
      }
      const msg = `Loading started for vehicle ${entry.truck.regNo} at bay ${assignedBayId}. Pumps are now active.${withTimer ? ` Auto-departure timer set for ${duration} seconds.` : ""}`;
      setSpokenMessage(msg);
      speak(msg);
      pushAlert({
        tone: "success",
        title: "Gantry Loading Started",
        message: `${entry.truck.regNo} @ ${assignedBayId}${withTimer ? ` (30s stay demo active)` : ""}`,
      });
    } catch (err) {
      speak(`Error starting loading. ${err.message}`);
      pushAlert({ tone: "error", title: "Loading Error", message: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function handleGantryFilledAndExit() {
    if (!entry) return;
    setCountdown(null);
    const targetPlate = entry.truck.regNo;
    const assignedBayId = scanResult?.allocation?.assignment?.bayId ?? entry.truck.bayId ?? "B03";
    setBusy(true);
    try {
      setGantryStatus("FILLED");
      // Trigger ANPR exit camera detection directly — marks LOADED + EXITED, frees bay, speaks thank-you voice
      const res = await yardApi.gantryExitDetection({
        numberPlate: targetPlate,
        cameraId: "GANTRY-EXIT-01",
      });

      setExitDetection(res);
      setGantryStatus("EXITED");
      const voiceSpeech = `Thank you for your visit! Vehicle ${targetPlate}. Your loading process has been completed and your departure has been recorded. Welcome again another day. Drive safely!`;
      setSpokenMessage(voiceSpeech);
      speak(voiceSpeech);

      pushAlert({
        tone: "success",
        title: "Gantry Filled & Departure Voice Broadcast",
        message: `${targetPlate} completed at ${assignedBayId}. Bay released.`,
      });
    } catch (err) {
      speak(`Exit detection failed. ${err.message}`);
      pushAlert({ tone: "error", title: "Exit Error", message: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function dispatchSmsPass() {
    if (!entry) return;
    setBusy(true);
    setSmsResult(null);
    try {
      const phone = smsPhone.trim() || entry.truck.driverPhone || "";
      const res = await yardApi.dispatchSms({ token: entry.token, phone: phone || undefined });
      setSmsResult(res);
      if (res.ok) {
        speak(`SMS queue pass dispatched to ${res.to}.`);
        pushAlert({
          tone: res.emulated ? "info" : "success",
          title: res.emulated ? "SMS emulated (demo)" : "SMS dispatched — TALK-SASA",
          message: `Token ${entry.token} → ${res.to}`,
        });
      } else {
        speak(`SMS dispatch failed. ${res.reason}`);
        pushAlert({ tone: "error", title: "SMS dispatch failed", message: res.reason });
      }
    } catch (err) {
      speak(`SMS dispatch error. ${err.message}`);
      pushAlert({ tone: "error", title: "SMS dispatch failed", message: err.message });
    } finally {
      setBusy(false);
    }
  }

  function toggleVoice() {
    setVoiceOn((v) => {
      const next = !v;
      localStorage.setItem("kpc_voice_enabled", next ? "on" : "off");
      if (next) speak("Voice guidance enabled.");
      return next;
    });
  }

  const filtered = useMemo(
    () => MANIFEST_PLATES.filter((p) => p.toLowerCase().includes(regNo.toLowerCase())),
    [regNo],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Gate Kiosk — ANPR & Gantry Control</h1>
          <p className="text-sm text-slate-400">
            ANPR entry capture → weighbridge → AI bay assignment → Gantry filled & voice departure
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleResetForm}
            className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
            title="Clear current screen for next vehicle (keeps history)"
          >
            <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
            <span>Scan Next Vehicle</span>
          </button>

          <button
            onClick={triggerStalledVehicleAlert}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-950/60 px-3 py-1.5 text-xs font-bold text-red-300 transition hover:bg-red-900/60 hover:border-red-500/70"
            title="Simulate 3-minute stalled vehicle breakdown and trigger response team voice alert"
          >
            <ShieldAlert className="h-3.5 w-3.5 text-red-400 animate-pulse" />
            <span>Simulate 3-Min Breakdown</span>
          </button>

          <div className="flex items-center gap-2 border-l border-white/10 pl-2">
            <StatusBadge pulse status={auth.ready ? "ACTIVE" : "WAITING"} />
            <button onClick={toggleVoice} title="Toggle voice guidance" className="btn-ghost px-2 py-1.5">
              {voiceOn ? <Volume2 className="h-4 w-4 text-emerald-300" /> : <VolumeX className="h-4 w-4 text-slate-500" />}
            </button>
          </div>
        </div>
      </div>

      {/* Response Team Breakdown Siren Alert Banner */}
      {stalledAlert && (
        <div className="relative overflow-hidden rounded-xl border border-red-500/60 bg-gradient-to-r from-red-950/90 via-slate-900 to-red-950 p-4 shadow-xl animate-in fade-in duration-300">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-red-500/20 p-2 text-red-400">
                <Wrench className="h-6 w-6 animate-bounce" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-red-500 animate-ping" />
                  <p className="text-xs uppercase font-extrabold tracking-wider text-red-400">
                    🚨 Response Team Dispatched · Yard Mechanical Breakdown Alert
                  </p>
                </div>
                <p className="mt-1 text-sm font-semibold text-white">
                  Vehicle <span className="font-mono text-emerald-300">{stalledAlert.regNo}</span> stalled en route to Gantry <span className="font-mono text-emerald-300">{stalledAlert.bayId}</span> (&gt;3 min timeout).
                </p>
                <p className="mt-0.5 text-xs text-slate-300">
                  {stalledAlert.voiceAnnouncement}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => speakAlert(stalledAlert.voiceAnnouncement)}
                className="rounded-lg border border-red-500/30 bg-red-900/40 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-800/50"
              >
                <Volume2 className="mr-1 inline h-3.5 w-3.5" /> Re-play Siren Voice
              </button>
              <button
                onClick={resolveStalledVehicle}
                disabled={busy}
                className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400 shadow-md"
              >
                Resolve & Re-Queue Vehicle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Voice Broadcast Banner when talking */}
      {spokenMessage && !stalledAlert && (
        <div className="relative overflow-hidden rounded-xl border border-emerald-400/40 bg-gradient-to-r from-emerald-950/80 via-slate-900 to-black p-4 text-xs shadow-lg animate-in fade-in duration-300">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-emerald-500/20 p-2 text-emerald-300">
                <Radio className="h-5 w-5 animate-pulse" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <span className="live-dot h-2 w-2 rounded-full bg-emerald-400" />
                  KPC Yard Voice Guidance · Live Audio Broadcast
                </p>
                <p className="mt-1 font-medium text-slate-200 text-sm italic">
                  "{spokenMessage}"
                </p>
              </div>
            </div>
            <button
              onClick={() => speak(spokenMessage)}
              className="btn-ghost shrink-0 border border-emerald-400/30 text-emerald-300 text-[11px] px-2.5 py-1"
              title="Repeat speech"
            >
              <Volume2 className="mr-1 h-3.5 w-3.5" /> Re-play Speech
            </button>
          </div>
        </div>
      )}

      {/* Persistent Recent Scans Bar */}
      {scanHistory.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3 backdrop-blur-md">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <ScanLine className="h-3.5 w-3.5 text-emerald-400" /> Scanned Tickets Session History
            </p>
            <span className="text-[10px] text-slate-500">Persisted across dashboards</span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {scanHistory.map((h, i) => (
              <div
                key={i}
                onClick={() => {
                  setRegNo(h.regNo);
                  capture();
                }}
                className={`flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1 text-xs transition ${
                  entry?.truck?.regNo === h.regNo
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-300 font-bold"
                    : "border-white/10 bg-slate-800/70 text-slate-300 hover:border-emerald-500/40"
                }`}
                title={`Click to reload scan for ${h.regNo}`}
              >
                <span className="font-mono text-white">{h.regNo}</span>
                <span className="text-[10px] text-slate-400">({h.time})</span>
                {h.verified && <CheckCircle2 className="h-3 w-3 text-emerald-400" />}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Cinematic ANPR camera */}
        <div className="card space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
            <Camera className="h-4 w-4" /> ANPR Camera 01 — Main Gate
          </div>

          <div className="anpr-scene aspect-video">
            <div className="anpr-road" />

            <div key={driveTick} className={`anpr-truck ${recording ? "enter" : "cruise"}`}>
              <svg viewBox="0 0 210 62" className="h-full w-full" role="img" aria-label="KPC fuel tanker driving">
                <defs>
                  <linearGradient id="tank" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0D7E43" />
                    <stop offset="1" stopColor="#0B6B3A" />
                  </linearGradient>
                </defs>
                <ellipse cx="32" cy="29" rx="13" ry="12" fill="#ffffff" opacity="0.05" />
                <rect x="6" y="15" width="116" height="27" rx="13.5" fill="url(#tank)" />
                <rect x="6" y="15" width="116" height="8" rx="4" fill="#ffffff" opacity="0.18" />
                <text
                  x="64"
                  y="34.5"
                  textAnchor="middle"
                  fontSize="14"
                  fontWeight="800"
                  fontStyle="italic"
                  fill="#ffffff"
                  fontFamily="ui-monospace, SFMono-Regular, monospace"
                  letterSpacing="2"
                >
                  KPC
                </text>
                <text
                  x="64"
                  y="39.5"
                  textAnchor="middle"
                  fontSize="5"
                  fill="#ffffff"
                  opacity="0.65"
                  fontFamily="ui-monospace, SFMono-Regular, monospace"
                  letterSpacing="1"
                >
                  KENYA PIPELINE CO.
                </text>
                <rect x="98" y="20" width="10" height="10" fill="#F59E0B" stroke="#111111" strokeWidth="1.2" />
                <rect x="5" y="23" width="3" height="6" fill="#DC2626" />

                <path d="M124 15 h32 q-12 13 -8 28 h-24 Z" fill="#0F2C1A" />
                <rect x="144" y="15" width="50" height="28" rx="5" fill="#0F2C1A" />
                <path d="M142 15 h7 q-3 12 2 28 h-7 q-4 -14 -2 -28 Z" fill="#0E2726" />
                <path d="M176 16 L196 20 L196 31 L170 31 Q174 22 176 16Z" fill="#9FD8C6" opacity="0.35" />
                <rect x="150" y="6" width="5" height="11" fill="#475569" />
                <rect x="149.5" y="5" width="6" height="3" rx="1.5" fill="#64748B" />

                <rect x="6" y="41" width="188" height="3" fill="#0A1F13" />
                <rect x="188" y="38" width="8" height="6" rx="2" fill="#334155" />
                <rect x="190" y="27" width="3" height="4" fill="#FBBF24" />
                <rect x="186" y="34" width="3" height="8" fill="#1E293B" />

                {[
                  { x: 30, y: 46 },
                  { x: 52, y: 46 },
                  { x: 150, y: 46 },
                  { x: 170, y: 46 },
                ].map((w, i) => (
                  <g key={i} transform={`translate(${w.x} ${w.y})`} className="anpr-wheel">
                    <circle r="8.5" fill="#0A0A0A" stroke="#1F2937" strokeWidth="1.5" />
                    {[0, 90, 180, 270].map((a) => (
                      <line
                        key={a}
                        x1="0"
                        y1="0"
                        x2={Math.cos((a * Math.PI) / 180) * 6}
                        y2={Math.sin((a * Math.PI) / 180) * 6}
                        stroke="#475569"
                        strokeWidth="1.5"
                      />
                    ))}
                    <circle r="3.2" fill="#CBD5E1" />
                  </g>
                ))}
              </svg>
            </div>

            <OcrReticle active={recording} confirmed={phase === "confirmed"} />

            <PlateReadout
              text={decodeTarget}
              locked={lockedChars}
              status={readInfo?.ok ? "ok" : readInfo ? "no" : "reading"}
              conf={readInfo?.conf ?? 96}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-xs uppercase tracking-wider text-slate-400">
              Scheduled Plate on Manifest
            </label>
            <div className="flex gap-2">
              <input
                value={regNo}
                onChange={(e) => setRegNo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && capture()}
                placeholder="e.g. KDB 456Y"
                className="input font-mono"
              />
              <button onClick={capture} disabled={busy || !regNo.trim()} className="btn-primary shrink-0">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                Ingest Vehicle
              </button>
            </div>

            <div className="flex flex-wrap gap-1 pt-1">
              {filtered.slice(0, 5).map((p) => (
                <button
                  key={p}
                  onClick={() => setRegNo(p)}
                  className="chip border border-white/10 bg-white/5 font-mono text-[10px] text-slate-300 hover:bg-white/10"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Token & journey status */}
        <div className="card space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-300">
            <QrCode className="h-4 w-4" /> Digital Token / Operational Control
          </div>

          {!entry ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Capture a vehicle to issue its KPC digital token.
            </p>
          ) : (
            <>
              <div className="rounded-lg border border-kpc-green/40 bg-kpc-green/10 p-4 text-center">
                <p className="text-xs uppercase tracking-widest text-emerald-300">Issued Token</p>
                <p className="mt-1 font-mono text-lg font-bold text-white">{entry.token}</p>
                <div className="mt-2 flex justify-center gap-2">
                  <StatusBadge pulse status={gantryStatus === "EXITED" ? "COMPLETED" : gantryStatus === "FILLED" ? "LOADED" : entry.truck.status} />
                  {entry.manifestVerified ? (
                    <span className="chip bg-emerald-500/20 text-emerald-300">Manifest ✓</span>
                  ) : (
                    <span className="chip bg-amber-500/20 text-amber-300">Verification Hold</span>
                  )}
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <p className="flex justify-between">
                  <span className="text-slate-400">Product</span>
                  <b>{entry.truck.product ?? "—"}</b>
                </p>
                <p className="flex justify-between">
                  <span className="text-slate-400">Capacity</span>
                  <b>{entry.truck.capacityLiters?.toLocaleString()} L</b>
                </p>
                <p className="flex justify-between">
                  <span className="text-slate-400">Driver</span>
                  <b>{entry.truck.driverName}</b>
                </p>
                <p className="flex justify-between">
                  <span className="text-slate-400">Assigned Bay</span>
                  <b className="text-emerald-300">
                    {scanResult?.allocation?.assignment?.bayId ?? entry.truck.bayId ?? "auto (at weighbridge)"}
                  </b>
                </p>
              </div>

              <div className="flex flex-wrap gap-2 pt-1 border-t border-white/10">
                <button onClick={() => runCheckpoint("GATE")} disabled={busy} className="btn-ghost text-xs">
                  RFID Gate
                </button>
                <button onClick={() => runCheckpoint("WEIGHBRIDGE")} disabled={busy} className="btn-primary text-xs">
                  Weighbridge → AI Bay Match
                </button>

                {/* ── ALARM VOICE BUTTON (between Weighbridge & Gantry) ── */}
                <button
                  onClick={triggerYard2BreakdownAlert}
                  disabled={busy}
                  title="Manually trigger response-team breakdown siren for Yard 2"
                  className="flex items-center gap-1.5 rounded-lg border border-orange-500/50 bg-orange-950/60 px-3 py-1.5 text-xs font-bold text-orange-300 transition hover:bg-orange-900/70 hover:border-orange-400"
                >
                  <ShieldAlert className="h-3.5 w-3.5 text-orange-400 animate-pulse" />
                  🔊 Yard 2 Alarm Voice
                </button>
              </div>

              {/* ── Yard 2 Staging Panel for KDD 001D ── */}
              {yard2Assigned && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-3 space-y-3 animate-in fade-in duration-300">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                      <Wrench className="h-4 w-4" /> Staging Yard 2 — KDD 001D
                    </p>
                    <span className={`chip text-[10px] font-mono border ${
                      yard2StalledFired
                        ? "border-red-400 bg-red-500/20 text-red-300 animate-pulse"
                        : yard2DriverAlerted
                        ? "border-orange-400 bg-orange-500/20 text-orange-200"
                        : "border-amber-400 bg-amber-500/20 text-amber-200"
                    }`}>
                      {yard2StalledFired ? "🚨 BREAKDOWN ALERT" : yard2DriverAlerted ? "⏳ Move to Gantry G2" : "🟡 Awaiting Gantry G2"}
                    </span>
                  </div>

                  {/* 5-min pre-alert countdown */}
                  {yard2PreAlertCountdown !== null && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-amber-300 font-mono">
                        <span>Driver pre-alert fires in (demo ×20 speed)</span>
                        <span className="font-bold">{yard2PreAlertCountdown}s</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all duration-1000"
                          style={{ width: `${Math.max(0, Math.min(100, ((15 - yard2PreAlertCountdown) / 15) * 100))}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* 3-min stalled countdown after driver alerted */}
                  {yard2StalledCountdown !== null && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-orange-300 font-mono">
                        <span>🚨 Response team alert fires in (demo ×10 speed)</span>
                        <span className="font-bold animate-pulse">{yard2StalledCountdown}s</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full bg-gradient-to-r from-orange-600 to-red-500 transition-all duration-1000"
                          style={{ width: `${Math.max(0, Math.min(100, ((18 - yard2StalledCountdown) / 18) * 100))}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <p className="text-[11px] text-slate-400">
                    KDD 001D is staged in Yard 2. System will notify the driver when Gantry G2 is ready (~5 min).
                    If the vehicle does not advance within 3 minutes after notification, the response team is auto-alerted.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={triggerYard2BreakdownAlert}
                      disabled={busy || yard2StalledFired}
                      className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-950/60 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-900/60"
                    >
                      <ShieldAlert className="h-3.5 w-3.5 animate-pulse" />
                      Manual Breakdown Alert
                    </button>
                    {yard2StalledFired && (
                      <button
                        onClick={() => { setYard2Assigned(false); setYard2StalledFired(false); setYard2DriverAlerted(false); }}
                        disabled={busy}
                        className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                      >
                        Clear Yard 2 Assignment
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Gantry Loading & Filled Talking Controls */}
              {scanResult?.allocation && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <Fuel className="h-4 w-4" /> Gantry Operations & Voice Announcement
                    </p>
                    {countdown !== null && (
                      <span className="chip border border-emerald-400 bg-emerald-500/20 text-emerald-200 font-mono text-[11px] animate-pulse">
                        ⏳ 30s Stay: {countdown}s left
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Once at the gantry, click below to start loading (with optional 30s stay demo), fill the tanker, and trigger the voice departure broadcast.
                  </p>

                  {countdown !== null && (
                    <div className="space-y-1.5 pt-1 rounded-md bg-black/30 p-2.5 border border-emerald-500/20">
                      <div className="flex justify-between text-[11px] text-emerald-300 font-mono font-medium">
                        <span>Demo Stay in Progress ({entry.truck.regNo})</span>
                        <span>{countdown}s until exit</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-all duration-1000"
                          style={{ width: `${Math.max(0, Math.min(100, ((30 - countdown) / 30) * 100))}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      onClick={() => handleStartLoading(false)}
                      disabled={busy || gantryStatus === "FILLED" || gantryStatus === "EXITED"}
                      className="btn-ghost text-xs border border-white/10"
                    >
                      Start Loading
                    </button>
                    <button
                      onClick={() => handleStartLoading(true, 30)}
                      disabled={busy || countdown !== null || gantryStatus === "FILLED" || gantryStatus === "EXITED"}
                      className="btn-primary text-xs bg-cyan-600 hover:bg-cyan-500 text-white font-bold flex items-center gap-1.5"
                    >
                      <Sparkles className="h-3.5 w-3.5" /> Start 30s Demo Stay & Auto-Exit
                    </button>
                    <button
                      onClick={handleGantryFilledAndExit}
                      disabled={busy}
                      className="btn-primary text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5"
                    >
                      <Sparkles className="h-3.5 w-3.5" /> {countdown !== null ? "Exit Now (Skip 30s)" : "Gantry Filled → Speak & Clear Exit"}
                    </button>
                    {countdown !== null && (
                      <button
                        onClick={() => setCountdown(null)}
                        className="btn-ghost text-xs text-rose-300 hover:bg-rose-500/20 border border-rose-500/30"
                      >
                        Cancel Timer
                      </button>
                    )}
                  </div>
                </div>
              )}

              {weightResult && (
                <div
                  className={`mt-2 rounded-lg border p-3 text-xs ${
                    weightResult.pass
                      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                      : "border-red-400/40 bg-red-500/10 text-red-200"
                  }`}
                >
                  <p className="font-semibold">Weighbridge Verification {weightResult.pass ? "✓ PASS" : "✗ HOLD"}</p>
                  <p className="mt-1">
                    Gross {weightResult.grossWeightKg?.toLocaleString()} kg — expected {weightResult.expectedGrossKg?.toLocaleString()} kg (Δ{" "}
                    {weightResult.diffKg} kg / ±{weightResult.tolerancePct}%)
                  </p>
                </div>
              )}

              <div className="mt-3 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
                <p className="text-xs font-semibold text-blue-300">Dispatch & Send SMS Pass</p>
                <label className="mt-2 block text-[10px] uppercase tracking-wider text-slate-400">Driver Phone</label>
                <div className="mt-1 flex gap-2">
                  <input
                    value={smsPhone}
                    onChange={(e) => setSmsPhone(e.target.value)}
                    placeholder="+254711000001 or 0745074245"
                    className="input font-mono text-xs"
                  />
                  <button onClick={dispatchSmsPass} disabled={busy || !entry?.token} className="btn-primary shrink-0 text-xs">
                    Send SMS Pass
                  </button>
                </div>
                {smsResult && (
                  <p className={`mt-2 text-xs ${smsResult.ok ? "text-emerald-300" : "text-red-300"}`}>
                    {smsResult.ok
                      ? `✓ ${smsResult.emulated ? "Emulated (demo mode)" : "Sent via TALK-SASA"} → ${smsResult.to}`
                      : `✗ ${smsResult.reason}`}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Closed-loop journey pipeline */}
      <div className="card">
        <p className="mb-3 text-sm font-semibold text-slate-300">Closed-loop journey</p>
        <div className="grid gap-2 md:grid-cols-5">
          {[
            { label: "Gate Entry", done: Boolean(entry?.token) },
            { label: "Weighbridge RFID", done: Boolean(scanResult?.checkpoint?.checkpoint === "WEIGHBRIDGE") },
            { label: "AI Bay Assigned", done: Boolean(scanResult?.allocation) },
            { label: "Gantry Filled", done: gantryStatus === "FILLED" || gantryStatus === "EXITED" },
            { label: "Exit ANPR (Voice)", done: gantryStatus === "EXITED" },
          ].map((s, i) => (
            <div
              key={s.label}
              className={`flex items-center gap-2 rounded-lg border p-3 text-sm ${
                s.done
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200 font-semibold"
                  : "border-white/10 bg-black/20 text-slate-500"
              }`}
            >
              {s.done ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <ArrowRight className="h-4 w-4" />}
              <span>{s.label}</span>
              <span className="ml-auto font-mono text-[10px]">0{i + 1}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}