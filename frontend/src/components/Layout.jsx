import { useState, useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Ticket,
  Smartphone,
  Map as MapIcon,
  Settings2,
  Volume2,
  VolumeX,
  BellRing,
  ShieldAlert,
  Truck,
  Sparkles,
} from "lucide-react";
import { isVoiceEnabled, setVoiceEnabled, speak, speakAlert, playAlertChime } from "../services/speech.js";
import { pushAlert } from "../components/AlertCenter.jsx";
import { yardApi } from "../services/api.js";

const NAV = [
  { to: "/", label: "Executive Dashboard", icon: LayoutDashboard, end: true },
  { to: "/depot-map", label: "Depot Map", icon: MapIcon },
  { to: "/gate-kiosk", label: "Gate Kiosk", icon: Ticket },
  { to: "/driver", label: "Driver Mobile", icon: Smartphone },
  { to: "/admin", label: "Admin Ops", icon: Settings2 },
];

export default function Layout() {
  const [voiceOn, setVoiceOn] = useState(() => isVoiceEnabled());

  const toggleVoice = () => {
    const next = !voiceOn;
    setVoiceEnabled(next);
    setVoiceOn(next);
    if (next) {
      speak("Voice guidance enabled.");
    }
  };

  const handleTestSiren = () => {
    playAlertChime();
    speakAlert("Attention NjiaSmart Response Team! Audio alarm test successful. Voice and siren alert system is operational.");
    pushAlert({
      tone: "info",
      title: "🔊 Audio Siren Test",
      message: "Playing siren chime & voice broadcast...",
    });
  };

  const handleTestKdd001dBreakdown = async () => {
    // 1. Initial Weighbridge & Yard 2 Direction
    speak("Vehicle KDD 001D verified at weighbridge. Directed to Staging Yard 2.");
    pushAlert({
      tone: "info",
      title: "Weighbridge Scan — KDD 001D",
      message: "Vehicle KDD 001D directed to Staging Yard 2 (ETA ~5 min).",
    });

    // 2. Pre-movement Alert (5 min window)
    setTimeout(() => {
      const preMsg = "KPC Yard · Pre-Movement: Gantry Bay G2 nearly clear. Vehicle KDD 001D at Yard 2, prepare to move forward to Gantry Bay G2.";
      speak(preMsg);
      pushAlert({
        tone: "warning",
        title: "5-Min Pre-Movement SMS — KDD 001D",
        message: "SMS sent to driver: Prepare to move from Yard 2 to Gantry Bay G2.",
      });
    }, 2000);

    // 3. Stalled / Mechanical Breakdown 3 Minutes Later Alert to Response Team
    setTimeout(async () => {
      try {
        const result = await yardApi.reportStalledTruck({
          truckId: "batch_kdd001d",
          bayId: "G2",
          reason: "YARD_2_MECHANICAL_BREAKDOWN_TIMEOUT",
        });

        const voiceText = "ALERT FOR RESPONSE TEAM! Vehicle KDD 001D at Yard 2 was assigned to Gantry Bay G2 but has not arrived within time. Potential mechanical breakdown in Yard 2. Response team dispatched to Yard 2 to check what is wrong with vehicle KDD 001D.";
        speakAlert(voiceText);

        pushAlert({
          tone: "error",
          title: "🚨 RESPONSE TEAM DISPATCHED — YARD 2 BREAKDOWN",
          message: "Vehicle KDD 001D stalled in Yard 2. Gantry Bay G2 automatically reallocated to next waiting truck.",
        });
      } catch (err) {
        speakAlert("ALERT FOR RESPONSE TEAM! Vehicle KDD 001D at Yard 2 has not arrived at Gantry Bay G2 within 3 minutes. Response team dispatched to Yard 2 to check what is wrong with that car.");
      }
    }, 4500);
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-40 flex w-16 flex-col items-center gap-2 border-r border-white/10 bg-black/40 py-4 md:w-56 md:items-stretch md:px-4">
        {/* ── Compact Logo Header ── */}
        <div className="mb-4 flex items-center justify-center px-1 md:justify-start">
          <img
            src="/images/logo_no_white_corners.png"
            alt="NjiaSmart Logo"
            className="h-10 w-auto object-contain md:h-12"
          />
        </div>
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                isActive
                  ? "bg-kpc-green/30 font-semibold text-emerald-300"
                  : "text-slate-400 hover:bg-white/10 hover:text-white"
              }`
            }
            title={label}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden md:inline">{label}</span>
          </NavLink>
        ))}
        <div className="mt-auto px-3 text-[10px] text-slate-600">
          Domain 1 · Problem 2
          <br />
          Autonomous Yard Control
        </div>
      </aside>

      <div className="ml-16 flex-1 flex flex-col md:ml-56">
        {/* Global Prominent Top Bar for Voice Controls & Test Siren */}
        <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-slate-900/90 px-4 py-2.5 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <img
              src="/images/logo_no_white_corners.png"
              alt="NjiaSmart Logo"
              className="h-6 w-auto object-contain"
            />
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              NjiaSmart Control Plane
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Prominent Voice Toggle Button */}
            <button
              onClick={toggleVoice}
              className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold transition shadow-sm ${
                voiceOn
                  ? "border-emerald-500/50 bg-emerald-500/20 text-emerald-300 shadow-emerald-500/10"
                  : "border-slate-700 bg-slate-800 text-slate-400"
              }`}
              title="Click to toggle voice alerts"
            >
              {voiceOn ? (
                <>
                  <Volume2 className="h-4 w-4 text-emerald-400 animate-pulse" />
                  <span>VOICE GUIDANCE: ON</span>
                </>
              ) : (
                <>
                  <VolumeX className="h-4 w-4 text-slate-500" />
                  <span>VOICE GUIDANCE: OFF</span>
                </>
              )}
            </button>

            {/* Test Alarm / Siren Button */}
            <button
              onClick={handleTestSiren}
              className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/60 px-3 py-1.5 text-xs font-bold text-amber-300 transition hover:bg-amber-900/60"
              title="Test Web Audio siren chime and voice alert"
            >
              <BellRing className="h-4 w-4 text-amber-400 animate-bounce" />
              <span>Test Audio Alarm</span>
            </button>

            {/* Specific KDD 001D Yard 2 Breakdown Test Button */}
            <button
              onClick={handleTestKdd001dBreakdown}
              className="flex items-center gap-1.5 rounded-lg border border-red-500/50 bg-red-950/80 px-3 py-1.5 text-xs font-extrabold text-red-200 transition hover:bg-red-900/80 shadow-md"
              title="Trigger KDD 001D Yard 2 breakdown notification and response team voice alert"
            >
              <ShieldAlert className="h-4 w-4 text-red-400 animate-bounce" />
              <span>Test KDD 001D Breakdown Alert</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}