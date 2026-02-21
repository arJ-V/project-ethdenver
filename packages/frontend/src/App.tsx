import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { IssuerPortal } from "./pages/IssuerPortal";
import { TraderTerminal } from "./pages/TraderTerminal";

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<Navigate to="/trader" replace />} />
          <Route path="/trader" element={<TraderTerminal />} />
          <Route path="/issuer" element={<IssuerPortal />} />
          <Route path="*" element={<Navigate to="/trader" replace />} />
        </Routes>
      </AppLayout>
    </BrowserRouter>
  );
}
