import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import AlertCenter from "./components/AlertCenter.jsx";
import ExecutiveDashboard from "./pages/ExecutiveDashboard.jsx";
import DepotMap from "./pages/DepotMap.jsx";
import GateKiosk from "./pages/GateKiosk.jsx";
import DriverMobile from "./pages/DriverMobile.jsx";
import AdminOps from "./pages/AdminOps.jsx";

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<ExecutiveDashboard />} />
          <Route path="depot-map" element={<DepotMap />} />
          <Route path="gate-kiosk" element={<GateKiosk />} />
          <Route path="driver" element={<DriverMobile />} />
          <Route path="admin" element={<AdminOps />} />
        </Route>
      </Routes>
      <AlertCenter />
    </>
  );
}