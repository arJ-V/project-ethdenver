import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router-dom";
import Live from "./pages/Live";
import Historical from "./pages/Historical";

function Nav() {
  const loc = useLocation();
  return (
    <nav style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #334155", display: "flex", gap: "1rem" }}>
      <Link to="/" style={{ fontWeight: loc.pathname === "/" ? "bold" : undefined }}>Live</Link>
      <Link to="/historical" style={{ fontWeight: loc.pathname === "/historical" ? "bold" : undefined }}>Historical</Link>
    </nav>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/" element={<Live />} />
        <Route path="/historical" element={<Historical />} />
      </Routes>
    </BrowserRouter>
  );
}
