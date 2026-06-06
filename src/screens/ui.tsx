import type { ReactNode } from "react";

export const PanelTitle = ({ icon, title }: { icon: ReactNode; title: string }) => (
  <div className="panel-title">
    {icon}
    <h2>{title}</h2>
  </div>
);

export const ProtocolBadge = ({ protocol }: { protocol: string }) => (
  <span className={`protocol-pill ${protocol === "rtmps" ? "secure" : ""}`}>{protocol.toUpperCase()}</span>
);
